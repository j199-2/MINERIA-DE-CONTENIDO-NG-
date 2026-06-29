export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { categoria, nicho, idioma } = req.body;
    const tavilyKey = process.env.TAVILY_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    if (!tavilyKey || !openRouterKey) {
        return res.status(500).json({ error: "Error: Faltan las claves en Vercel." });
    }

    // ==========================================================================================
    // NIVEL 1: DRAMAS (Sin cambios, perfecto)
    // ==========================================================================================
    if (nicho === 'dramas') {
        const idiomaCompleto = idioma === 'es' ? 'español' : 'english';
        const query = `"${categoria}" mini serie web online -app -playstore -apk -descargar aplicacion`;
        
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
                body: JSON.stringify({ query, search_depth: "advanced", max_results: 10, include_domains: fuentesDrama })
            });
            const data = await response.json();
            if (!data.results) return res.status(200).json({ series: [] });

            const textoParaIA = data.results.map((item, i) => `Serie ${i+1}:\nTitulo: ${item.title}\nTexto: ${item.content}\nURL: ${item.url}`).join("\n\n");

            const promptDrama = idioma === 'es' 
            ? `Analiza estos resultados de "${categoria}". Si el texto dice cuántos eps gratis, ponlo. Si no dice nada, pon "Verificar en la web". Devuelve ÚNICAMENTE este JSON: {"resultados": [{"nombre": "Título", "descripcion": "De qué va", "capitulos": "X gratis" o "Verificar en la web", "url": "enlace"}]} Datos: ${textoParaIA}`
            : `Analyze these "${categoria}" results. If text says free eps, write it. If not, "Check website". Return ONLY this JSON: {"resultados": [{"nombre": "Title", "descripcion": "About", "capitulos": "X free" or "Check website", "url": "link"}]} Data: ${textoParaIA}`;

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
                return res.status(200).json({ series: data.results.map(i => ({ nombre: i.title, descripcion: "Mini serie", capitulos: "Verificar", url: i.url })) });
            }
        } catch (error) {
            return res.status(500).json({ error: "Error en dramas: " + error.message });
        }
    } 
    
    // ==========================================================================================
    // NIVEL 2: CLIPPING (Jardín Vallado + Orden Estricto por Fecha)
    // ==========================================================================================
    else {
        const es = idioma === 'es';
        
        // LAS FUENTES EXCLUSIVAS DE VIDEO Y AUDIO (Cero noticias, cero artículos basura)
        const fuentesVideo = ["youtube.com", "rumble.com", "odysee.com", "vimeo.com", "dailymotion.com"];
        const fuentesAudio = ["spotify.com", "podcasts.apple.com", "soundcloud.com", "castbox.fm"];
        const fuentesFusionadas = [...fuentesVideo, ...fuentesAudio];

        let queries = [];

        if (nicho === 'salud') {
            queries = es ? [
                `"${categoria}" rutina ejercicio completo`,
                `entrevista doctor explicando "${categoria}"`,
                `podcast salud bienestar "${categoria}"`
            ] : [
                `"${categoria}" full workout routine`,
                `doctor interview explaining "${categoria}"`,
                `health wellness podcast "${categoria}"`
            ];
        } else if (nicho === 'motivacion') {
            queries = es ? [
                `"${categoria}" conferencia motivacional completa`,
                `entrevista emprendedor exitoso "${categoria}"`,
                `podcast negocios desarrollo personal "${categoria}"`
            ] : [
                `"${categoria}" full motivational speech`,
                `successful entrepreneur interview "${categoria}"`,
                `business personal development podcast "${categoria}"`
            ];
        } else if (nicho === 'religion') {
            queries = es ? [
                `"${categoria}" predica cristiana completa`,
                `estudio biblico profundo sobre "${categoria}"`,
                `podcast fe cristiana testimonio "${categoria}"`
            ] : [
                `"${categoria}" full christian sermon`,
                `deep biblical study about "${categoria}"`,
                `christian faith podcast testimony "${categoria}"`
            ];
        }

        try {
            const promesasBusqueda = queries.map(query => 
                fetch("https://api.tavily.com/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tavilyKey}` },
                    body: JSON.stringify({ 
                        query, 
                        search_depth: "advanced", 
                        max_results: 8,
                        time_range: "week",
                        // LA SOLUCIÓN FINAL: Solo buscar en estas webs. Es imposible traer noticias de aquí.
                        include_domains: fuentesFusionadas
                    })
                }).then(res => res.json())
            );

            const resultadosFusionados = await Promise.all(promesasBusqueda);
            let materiaBruta = [];
            const urlsVistas = new Set();
            
            // Extraemos la fecha de publicación de Tavily
            resultadosFusionados.forEach(data => {
                if (data && data.results) {
                    data.results.forEach(item => {
                        if (!urlsVistas.has(item.url)) {
                            urlsVistas.add(item.url);
                            materiaBruta.push({
                                titulo: item.title,
                                contenido: item.content,
                                url: item.url,
                                fecha: item.published_date || "2024-01-01" // Formato YYYY-MM-DD
                            });
                        }
                    });
                }
            });

            if (materiaBruta.length === 0) return res.status(200).json({ series: [] });

            const textoParaIA = materiaBruta.map((item, i) => `Item ${i+1}:\nTitulo: ${item.titulo}\nContenido: ${item.contenido}\nURL: ${item.url}\nFecha: ${item.fecha}`).join("\n\n");

            // EL NUEVO PROMPT: Orden estricto cronológico
            const promptIA = es 
            ? `Eres un experto en encontrar material para Clipping. Te voy a dar una lista sobre "${categoria}".
            INSTRUCCIONES CRÍTICAS:
            1. SOLO admite Videos largos o Podcasts. Si hay algo que no sea de estos dominios, descártalo.
            2. ORDEN CRONOLÓGICO: Usa la "Fecha" de cada Item. Debes ordenar los resultados del más reciente al más antiguo. El que tenga la fecha más cercana a hoy va primero.
            3. Formato del JSON: "Video Largo" o "Podcast/Audio".
            Devuelve ÚNICAMENTE este JSON ordenado: {"resultados": [{"nombre": "Título", "tipo_contenido": "Video Largo", "descripcion": "De qué va...", "potencial_viralidad": "Por qué...", "gancho": "Qué hacer...", "url": "enlace"}]} 
            Datos: ${textoParaIA}`
            : `You are an expert at finding material for Clipping. I will give you a list about "${categoria}".
            CRITICAL INSTRUCTIONS:
            1. ONLY accept Long Videos or Podcasts. Discard anything else.
            2. CHRONOLOGICAL ORDER: Use the "Fecha" of each Item. You must order results from most recent to oldest. The one with the closest date to today goes first.
            3. JSON Format: "Long Video" or "Podcast/Audio".
            Return ONLY this ordered JSON: {"resultados": [{"nombre": "Title", "tipo_contenido": "Long Video", "descripcion": "About...", "potencial_viralidad": "Why...", "gancho": "What to do...", "url": "link"}]} 
            Data: ${textoParaIA}`;

            const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openRouterKey}`, "HTTP-Referer": "https://nextgen-creators.vercel.app", "X-Title": "NextGen Creators" },
                body: JSON.stringify({ model: "meta-llama/llama-3.1-8b-instruct:free", messages: [{ role: "user", content: promptIA }], temperature: 0.3, response_format: { type: "json_object" } })
            });

            const orData = await openRouterResponse.json();
            if (!orData.choices || !orData.choices[0] || !orData.choices[0].message) {
                const respaldo = materiaBruta.slice(0, 5).map(i => ({ nombre: i.titulo, tipo_contenido: "Video Largo", descripcion: "Materia prima", potencial_viralidad: "Alta", gancho: "Revisa el enlace", url: i.url }));
                return res.status(200).json({ series: respaldo });
            }

            const textoRespuesta = orData.choices[0].message.content || "{}";
            try {
                const parseado = JSON.parse(textoRespuesta);
                const seriesFinales = parseado.resultados || [];
                if (!Array.isArray(seriesFinales) || seriesFinales.length === 0) {
                    const respaldo = materiaBruta.slice(0, 5).map(i => ({ nombre: i.titulo, tipo_contenido: "Video Largo", descripcion: "Materia prima", potencial_viralidad: "Alta", gancho: "Revisa el enlace", url: i.url }));
                    return res.status(200).json({ series: respaldo });
                }
                return res.status(200).json({ series: seriesFinales });
            } catch (parseError) {
                const respaldo = materiaBruta.slice(0, 5).map(i => ({ nombre: i.titulo, tipo_contenido: "Video Largo", descripcion: "Materia prima", potencial_viralidad: "Alta", gancho: "Revisa el enlace", url: i.url }));
                return res.status(200).json({ series: respaldo });
            }
        } catch (error) {
            return res.status(500).json({ error: "Error de conexión: " + error.message });
        }
    }
}
