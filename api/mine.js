export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { categoria, nicho, idioma } = req.body;
    const tavilyKey = process.env.TAVILY_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    if (!tavilyKey || !openRouterKey) {
        return res.status(500).json({ error: "Error: Faltan las claves en Vercel." });
    }

    const idiomaCompleto = idioma === 'es' ? 'español' : 'english';

    // ==========================================
    // NIVEL 1: DRAMAS (Búsqueda rápida sin IA)
    // ==========================================
    if (nicho === 'dramas') {
        try {
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
    // NIVEL 2: CLIPPING (Tavily extrae + OpenRouter analiza)
    // ==========================================================================================
    
    let queryTavily = `${categoria} video largo o podcast reciente ${idiomaCompleto}`;

    try {
        // 1. EL MINERO: Tavily busca en internet
        const tavilyResponse = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tavilyKey}` },
            body: JSON.stringify({ 
                query: queryTavily, 
                search_depth: "advanced", 
                max_results: 15,
                time_range: "week",
                // BLOQUEO ESTRICTO DE BASURA
                exclude_domains: ["instagram.com", "facebook.com", "tiktok.com", "twitter.com", "x.com"]
            })
        });

        const tavilyData = await tavilyResponse.json();
        if (!tavilyData.results || tavilyData.results.length === 0) return res.status(200).json({ series: [] });

        // Respaldo de emergencia por si la IA falla
        const respaldoSeguro = tavilyData.results.slice(0, 5).map(item => ({
            nombre: item.title, tipo_contenido: "Contenido Encontrado", descripcion: "Materia prima.", potencial_viralidad: "Requiere análisis", gancho: "Revisa el enlace.", url: item.url
        }));

        // Preparamos la materia prima para el Joyero
        const materiaPrima = tavilyData.results.map((item, i) => `Resultado ${i+1}:\nTitulo: ${item.title}\nContenido: ${item.content}\nURL: ${item.url}`).join("\n\n");

        // 2. EL JEWELO: OpenRouter analiza y filtra
        const promptIA = idioma === 'es' 
        ? `Eres un Curador Experto para creadores de TikTok/Reels. Encuentra las 3 a 5 piezas MÁS VALIOSAS sobre "${categoria}" para hacer clipping.
        INSTRUCCIONES ESTRICTAS:
        1. FORMATO: Si es video/podcast largo: "Video Largo" o "Podcast/Audio". Si es un ARTÍCULO excelente para video Faceless: "Artículo/Noticia".
        2. RELEVANCIA: Ignora lo que no tenga absolutamente nada que ver con "${categoria}".
        Devuelve ÚNICAMENTE un JSON estructurado así: {"resultados": [{"nombre": "Título", "tipo_contenido": "Video Largo", "descripcion": "De qué va...", "potencial_viralidad": "Por qué...", "gancho": "Qué hacer...", "url": "enlace"}]}
        Datos: ${materiaPrima}`
        : `You are an Expert Curator for TikTok/Reels creators. Find the 3 to 5 MOST VALUABLE pieces about "${categoria}" for clipping.
        STRICT INSTRUCTIONS:
        1. FORMAT: If long video/podcast: "Long Video" or "Podcast/Audio". If an excellent article for Faceless video: "Article/News".
        2. RELEVANCE: Ignore anything that has nothing to do with "${categoria}".
        Return ONLY a structured JSON like this: {"resultados": [{"nombre": "Title", "tipo_contenido": "Long Video", "descripcion": "About...", "potencial_viralidad": "Why...", "gancho": "What to do...", "url": "link"}]}
        Data: ${materiaPrima}`;

        const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json", 
                "Authorization": `Bearer ${openRouterKey}`,
                "HTTP-Referer": "https://nextgen-creators.vercel.app", 
                "X-Title": "NextGen Creators"
            },
            body: JSON.stringify({
                // ⚠️ EL INTERRUPTOR DE NEGOCIO ⚠️
                // Modo Gratis actual: "meta-llama/llama-3.1-8b-instruct:free"
                // Modo PRO del futuro: "meta-llama/llama-3.1-70b-instruct" (Borra el :free cuando quieras escalar)
                model: "meta-llama/llama-3.1-8b-instruct:free", 
                messages: [{ role: "user", content: promptIA }],
                temperature: 0.3,
                // Forzamos que la respuesta sea un JSON válido para evitar errores
                response_format: { type: "json_object" } 
            })
        });

        const orData = await openRouterResponse.json();
        
        // Si OpenRouter falla, lanzamos el respaldo
        if (!orData.choices || !orData.choices[0] || !orData.choices[0].message) {
            console.error("Error de OpenRouter:", JSON.stringify(orData));
            return res.status(200).json({ series: respaldoSeguro });
        }

        const textoRespuesta = orData.choices[0].message.content || "{}";
        
        let seriesAnalizadas;
        try {
            const parseado = JSON.parse(textoRespuesta);
            seriesAnalizadas = parseado.resultados || [];
            
            // Si la IA no encontró nada útil, lanzamos el respaldo
            if (!Array.isArray(seriesAnalizadas) || seriesAnalizadas.length === 0) {
                return res.status(200).json({ series: respaldoSeguro });
            }
        } catch (parseError) {
            // Si el JSON tiene un error de formato, lanzamos el respaldo
            return res.status(200).json({ series: respaldoSeguro });
        }

        // ¡ÉXITO! Devolvemos el oro puro analizado por la IA
        return res.status(200).json({ series: seriesAnalizadas });

    } catch (error) {
        console.error("Error general:", error);
        return res.status(500).json({ error: "Error de conexión: " + error.message });
    }
}
