export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { categoria, nicho, idioma } = req.body;
    const tavilyKey = process.env.TAVILY_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    if (!tavilyKey || !openRouterKey) {
        return res.status(500).json({ error: "Error: Faltan las claves en Vercel." });
    }

    // ==========================================
    // NIVEL 1: DRAMAS (Aparte, sin fusionar)
    // ==========================================
    if (nicho === 'dramas') {
        try {
            const idiomaCompleto = idioma === 'es' ? 'español' : 'english';
            const query = `mini series cortas "${categoria}" ${idiomaCompleto} lista de reproducción youtube`;
            const response = await fetch("https://api.tavily.com/search", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tavilyKey}` },
                body: JSON.stringify({ query, search_depth: "basic", max_results: 5 })
            });
            const data = await response.json();
            if (!data.results) return res.status(200).json({ series: [] });
            const series = data.results.map(item => ({ nombre: item.title, genero: categoria, capitulos: "5+", viralidad: "Alta", url: item.url }));
            return res.status(200).json({ series });
        } catch (error) {
            return res.status(500).json({ error: "Error buscando dramas: " + error.message });
        }
    }

    // ==========================================================================================
    // NIVEL 2: CLIPPING (EL CEREBRO ÚNICO - Búsqueda de Fusión Múltiple)
    // ==========================================================================================
    
    // Configuramos los 3 Láseres según el idioma
    const es = idioma === 'es';
    let queries = [];

    if (nicho === 'salud') {
        queries = es ? [
            `"${categoria}" rutina ejercicio completo site:youtube.com`,
            `entrevista doctor explicando "${categoria}" site:youtube.com`,
            `podcast salud bienestar "${categoria}"`
        ] : [
            `"${categoria}" full workout routine site:youtube.com`,
            `doctor interview explaining "${categoria}" site:youtube.com`,
            `health wellness podcast "${categoria}"`
        ];
    } else if (nicho === 'motivacion') {
        queries = es ? [
            `"${categoria}" conferencia motivacional completa site:youtube.com`,
            `entrevista emprendedor exitoso "${categoria}" site:youtube.com`,
            `podcast negocios desarrollo personal "${categoria}"`
        ] : [
            `"${categoria}" full motivational speech site:youtube.com`,
            `successful entrepreneur interview "${categoria}" site:youtube.com`,
            `business personal development podcast "${categoria}"`
        ];
    } else if (nicho === 'religion') {
        queries = es ? [
            `"${categoria}" predica cristiana completa site:youtube.com`,
            `estudio biblico profundo sobre "${categoria}" site:youtube.com`,
            `podcast fe cristiana testimonio "${categoria}"`
        ] : [
            `"${categoria}" full christian sermon site:youtube.com`,
            `deep biblical study about "${categoria}" site:youtube.com`,
            `christian faith podcast testimony "${categoria}"`
        ];
    }

    try {
        // DISPARAMOS LOS 3 LÁSERES AL MISMO TIEMPO (Paralelo)
        const promesasBusqueda = queries.map(query => 
            fetch("https://api.tavily.com/search", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tavilyKey}` },
                body: JSON.stringify({ 
                    query, 
                    search_depth: "basic", // Usamos basic para que sea ultra rápido
                    max_results: 7, // Traemos 7 x 3 = 21 resultados brutos
                    time_range: "month", // Ampliamos a un mes para encontrar más material
                    exclude_domains: ["instagram.com", "facebook.com", "tiktok.com", "twitter.com", "x.com"]
                })
            }).then(res => res.json())
        );

        // Esperamos a que los 3 láseres terminen
        const resultadosFusionados = await Promise.all(promesasBusqueda);

        // Juntamos toda la materia prima y eliminamos URLs duplicadas
        let materiaBruta = [];
        const urlsVistas = new Set();
        
        resultadosFusionados.forEach(data => {
            if (data && data.results) {
                data.results.forEach(item => {
                    if (!urlsVistas.has(item.url)) {
                        urlsVistas.add(item.url);
                        materiaBruta.push(item);
                    }
                });
            }
        });

        if (materiaBruta.length === 0) return res.status(200).json({ series: [] });

        // Formateamos para que la IA lo lea fácil
        const textoParaIA = materiaBruta.map((item, i) => `Item ${i+1}:\nTitulo: ${item.title}\nContenido: ${item.content}\nURL: ${item.url}`).join("\n\n");

        // EL JEWELO (OpenRouter) analiza la fusión
        const promptIA = es 
        ? `Eres un experto en encontrar material para hacer Clipping (recortes virales). 
        Te voy a dar una lista fusionada de videos y podcasts sobre "${categoria}".
        Tu MISIÓN es encontrar los 5 mejores para hacer clips de TikTok/Reels.
        REGLAS:
        1. FORMATO: Solo "Video Largo" o "Podcast/Audio".
        2. RELEVANCIA: Estrictamente sobre "${categoria}".
        Devuelve ÚNICAMENTE este JSON: {"resultados": [{"nombre": "Título", "tipo_contenido": "Video Largo", "descripcion": "De qué va...", "potencial_viralidad": "Por qué...", "gancho": "Qué hacer...", "url": "enlace"}]}
        Datos: ${textoParaIA}`
        : `You are an expert at finding material for Clipping (viral shorts). 
        I will give you a fused list of videos and podcasts about "${categoria}".
        Your MISSION is to find the top 5 for TikTok/Reels clips.
        RULES:
        1. FORMAT: Only "Long Video" or "Podcast/Audio".
        2. RELEVANCE: Strictly about "${categoria}".
        Return ONLY this JSON: {"resultados": [{"nombre": "Title", "tipo_contenido": "Long Video", "descripcion": "About...", "potencial_viralidad": "Why...", "gancho": "What to do...", "url": "link"}]}
        Data: ${textoParaIA}`;

        const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json", 
                "Authorization": `Bearer ${openRouterKey}`,
                "HTTP-Referer": "https://nextgen-creators.vercel.app", 
                "X-Title": "NextGen Creators"
            },
            body: JSON.stringify({
                model: "meta-llama/llama-3.1-8b-instruct:free", 
                messages: [{ role: "user", content: promptIA }],
                temperature: 0.3,
                response_format: { type: "json_object" } 
            })
        });

        const orData = await openRouterResponse.json();
        
        if (!orData.choices || !orData.choices[0] || !orData.choices[0].message) {
            // Si la IA falla, mostramos los primeros 5 crudos como respaldo
            const respaldo = materiaBruta.slice(0, 5).map(i => ({ nombre: i.title, tipo_contenido: "Video Largo", descripcion: "Materia prima", potencial_viralidad: "Alta", gancho: "Revisa el enlace", url: i.url }));
            return res.status(200).json({ series: respaldo });
        }

        const textoRespuesta = orData.choices[0].message.content || "{}";
        
        try {
            const parseado = JSON.parse(textoRespuesta);
            const seriesFinales = parseado.resultados || [];
            
            if (!Array.isArray(seriesFinales) || seriesFinales.length === 0) {
                const respaldo = materiaBruta.slice(0, 5).map(i => ({ nombre: i.title, tipo_contenido: "Video Largo", descripcion: "Materia prima", potencial_viralidad: "Alta", gancho: "Revisa el enlace", url: i.url }));
                return res.status(200).json({ series: respaldo });
            }

            return res.status(200).json({ series: seriesFinales });
        } catch (parseError) {
            const respaldo = materiaBruta.slice(0, 5).map(i => ({ nombre: i.title, tipo_contenido: "Video Largo", descripcion: "Materia prima", potencial_viralidad: "Alta", gancho: "Revisa el enlace", url: i.url }));
            return res.status(200).json({ series: respaldo });
        }

    } catch (error) {
        console.error("Error general:", error);
        return res.status(500).json({ error: "Error de conexión: " + error.message });
    }
}
