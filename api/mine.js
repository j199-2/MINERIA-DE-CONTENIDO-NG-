export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { categoria, nicho, idioma } = req.body;
    const tavilyKey = process.env.TAVILY_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    if (!tavilyKey || !openRouterKey) {
        return res.status(500).json({ error: "Error: Faltan las claves en Vercel." });
    }

    // ==========================================================================================
    // NIVEL 1: DRAMAS (Jardín Vallado + Modo Investigador de Episodios)
    // ==========================================================================================
    if (nicho === 'dramas') {
        const idiomaCompleto = idioma === 'es' ? 'español' : 'english';
        const query = `"${categoria}" mini serie`;
        
        const fuentesDrama = [
            "shortmax.tv", "dramaboxdb.com", "reelshort.com", "free-reels.com", "flextv.cc", 
            "goodshort.com", "moboreels.com", "topshort.tv", "serealplus.com", "shorttv.com", 
            "unireel.com", "playletmedia.com", "minidrama.com", "vigloo.com", "topreels.com", 
            "starshort.com", "sodatv.com", "shortical.com", "weshort.com", "klipist.com", 
            "iq.com", "dailymotion.com", "bilibili.tv", "biteshort.com", "snapshort.tv", 
            "tickshort.com", "joyreels.com", "megashort.com", "pocketreels.com", "funshort.tv", 
            "hotshort.tv", "magicreels.com", "crazyshort.com", "wowshort.com"
        ];

        try {
            const response = await fetch("https://api.tavily.com/search", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tavilyKey}` },
                body: JSON.stringify({ 
                    query, 
                    search_depth: "advanced", 
                    max_results: 10,
                    include_domains: fuentesDrama
                })
            });
            const data = await response.json();
            if (!data.results || data.results.length === 0) return res.status(200).json({ series: [] });

            const textoParaIA = data.results.map((item, i) => `Serie ${i+1}:\nTitulo: ${item.title}\nTexto: ${item.content}\nURL: ${item.url}`).join("\n\n");

            // MODO INVESTIGADOR: Estricto sobre los episodios gratis
            const promptDrama = idioma === 'es' 
            ? `Eres un extractor de datos de Mini Dramas. Analiza estos resultados de "${categoria}".
            INSTRUCCIÓN CRÍTICA SOBRE EPISODIOS:
            1. Lee el texto buscando palabras clave: "free", "gratis", "episodios", "episodes", o números seguidos de esas palabras (ej: "5 free", "10 episodios gratis").
            2. Si encuentras el dato exacto, escríbelo tal cual (Ej: "5 episodios gratis" o "Primeros 10 gratis").
            3. SI EL TEXTO NO DICE NADA SOBRE EPISODIOS GRATIS, NO INVENTES. Escribe exactamente: "Verificar en la web".
            Devuelve ÚNICAMENTE un JSON: {"resultados": [{"nombre": "Título limpio", "descripcion": "De qué trata en 2 líneas", "capitulos": "X episodios gratis" o "Verificar en la web", "url": "enlace"}]}
            Datos: ${textoParaIA}`
            : `You are a Mini Drama data extractor. Analyze these results for "${categoria}".
            CRITICAL INSTRUCTION ON EPISODES:
            1. Read the text looking for keywords: "free", "episodes", or numbers next to them (eg: "5 free", "10 free episodes").
            2. If you find the exact data, write it exactly (Eg: "5 free episodes" or "First 10 free").
            3. IF THE TEXT SAYS NOTHING ABOUT FREE EPISODES, DO NOT INVENT. Write exactly: "Check website".
            Return ONLY a JSON: {"resultados": [{"nombre": "Clean title", "descripcion": "What it's about in 2 lines", "capitulos": "X free episodes" or "Check website", "url": "link"}]}
            Data: ${textoParaIA}`;

            const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openRouterKey}`, "HTTP-Referer": "https://nextgen-creators.vercel.app", "X-Title": "NextGen Creators" },
                body: JSON.stringify({ model: "meta-llama/llama-3.1-8b-instruct:free", messages: [{ role: "user", content: promptDrama }], temperature: 0.2, response_format: { type: "json_object" } })
            });

            const orData = await orResponse.json();
            if (orData.choices && orData.choices[0]) {
                const parseado = JSON.parse(orData.choices[0].message.content);
                return res.status(200).json({ series: parseado.resultados || [] });
            } else {
                const respaldo = data.results.map(i => ({ nombre: i.title, descripcion: "Mini serie encontrada", capitulos: "Verificar en la web", url: i.url }));
                return res.status(200).json({ series: respaldo });
            }
        } catch (error) {
            return res.status(500).json({ error: "Error en dramas: " + error.message });
        }
    }

    // ==========================================================================================
    // NIVEL 2: CLIPPING (EL CEREBRO ÚNICO - Sin cambios, perfecto)
    // ==========================================================================================
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
        const promesasBusqueda = queries.map(query => 
            fetch("https://api.tavily.com/search", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tavilyKey}` },
                body: JSON.stringify({ query, search_depth: "basic", max_results: 7, time_range: "month", exclude_domains: ["instagram.com", "facebook.com", "tiktok.com", "twitter.com", "x.com"] })
            }).then(res => res.json())
        );

        const resultadosFusionados = await Promise.all(promesasBusqueda);
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

        const textoParaIA = materiaBruta.map((item, i) => `Item ${i+1}:\nTitulo: ${item.title}\nContenido: ${item.content}\nURL: ${item.url}`).join("\n\n");

        const promptIA = es 
        ? `Eres un experto en encontrar material para Clipping. Te voy a dar una lista fusionada sobre "${categoria}". Encuentra los 5 mejores para clips. REGLAS: Formato "Video Largo" o "Podcast/Audio". Devuelve ÚNICAMENTE este JSON: {"resultados": [{"nombre": "Título", "tipo_contenido": "Video Largo", "descripcion": "De qué va...", "potencial_viralidad": "Por qué...", "gancho": "Qué hacer...", "url": "enlace"}]} Datos: ${textoParaIA}`
        : `You are an expert at finding material for Clipping. I will give you a fused list about "${categoria}". Find the top 5 for clips. RULES: Format "Long Video" or "Podcast/Audio". Return ONLY this JSON: {"resultados": [{"nombre": "Title", "tipo_contenido": "Long Video", "descripcion": "About...", "potencial_viralidad": "Why...", "gancho": "What to do...", "url": "link"}]} Data: ${textoParaIA}`;

        const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openRouterKey}`, "HTTP-Referer": "https://nextgen-creators.vercel.app", "X-Title": "NextGen Creators" },
            body: JSON.stringify({ model: "meta-llama/llama-3.1-8b-instruct:free", messages: [{ role: "user", content: promptIA }], temperature: 0.3, response_format: { type: "json_object" } })
        });

        const orData = await openRouterResponse.json();
        if (!orData.choices || !orData.choices[0] || !orData.choices[0].message) {
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
        return res.status(500).json({ error: "Error de conexión: " + error.message });
    }
}
