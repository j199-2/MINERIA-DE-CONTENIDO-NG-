export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { categoria, nicho, idioma } = req.body;
    const tavilyKey = process.env.TAVILY_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!tavilyKey || !geminiKey) {
        return res.status(500).json({ error: "Error: Faltan las claves API (Tavily o Gemini) en Vercel." });
    }

    const idiomaCompleto = idioma === 'es' ? 'español' : 'english';

    // ==========================================
    // NIVEL 1: DRAMAS
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
            
            const series = data.results.map(item => ({ 
                nombre: item.title, genero: categoria, capitulos: "5+", viralidad: "Alta", url: item.url 
            }));
            return res.status(200).json({ series });
        } catch (error) {
            return res.status(500).json({ error: "Error buscando dramas: " + error.message });
        }
    }

    // ==========================================================================================
    // NIVEL 2: CLIPPING (Bloqueador Real + Gemini)
    // ==========================================================================================
    
    let queryTavily = `${categoria} video largo o podcast reciente ${idiomaCompleto}`;

    try {
        // 1. TAVILY CON EXCLUSIÓN REAL
        const tavilyResponse = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tavilyKey}` },
            body: JSON.stringify({ 
                query: queryTavily, 
                search_depth: "advanced", 
                max_results: 15,
                time_range: "week",
                // EL GOLPE MAESTRO: Le prohibimos a Tavily escanear estos dominios. Es imposible que los traiga.
                exclude_domains: ["instagram.com", "facebook.com", "tiktok.com", "twitter.com", "x.com"]
            })
        });

        const tavilyData = await tavilyResponse.json();
        if (!tavilyData.results || tavilyData.results.length === 0) {
            return res.status(200).json({ series: [] });
        }

        // Respaldo de emergencia (Ahora seguro, sin Instagram)
        const respaldoSeguro = tavilyData.results.slice(0, 5).map(item => ({
            nombre: item.title,
            tipo_contenido: "Contenido Encontrado",
            descripcion: "Materia prima de la semana.",
            potencial_viralidad: "Requiere análisis manual",
            gancho: "Revisa el enlace para extraer el clip.",
            url: item.url
        }));

        const materiaPrima = tavilyData.results.map((item, i) => `Resultado ${i+1}:\nTitulo: ${item.title}\nContenido: ${item.content}\nURL: ${item.url}`).join("\n\n");

        // 2. GEMINI
        const promptGemini = idioma === 'es' 
        ? `Eres un Curador de Contenido Experto para creadores de TikTok/Reels. Te voy a dar resultados sobre "${categoria}".
        Encuentra las 3 a 5 piezas MÁS VALIOSAS para clipping.
        
        INSTRUCCIONES:
        1. FORMATO: 
           - Si es video/podcast largo: "Video Largo" o "Podcast/Audio".
           - Si es un ARTÍCULO excelente para video Faceless: "Artículo/Noticia".
        2. RELEVANCIA: Ignora lo que no tenga que ver con "${categoria}".
        
        Devuelve ÚNICAMENTE un JSON array:
        {"nombre": "Título", "tipo_contenido": "Video Largo" o "Podcast/Audio" o "Artículo/Noticia", "descripcion": "De qué va...", "potencial_viralidad": "Por qué...", "gancho": "Qué hacer...", "url": "enlace"}
        Datos: ${materiaPrima}`
        : `You are an Expert Content Curator. I will give you results about "${categoria}".
        Find the 3 to 5 MOST VALUABLE pieces for clipping.
        
        INSTRUCTIONS:
        1. FORMAT: 
           - If long video/podcast: "Long Video" or "Podcast/Audio".
           - If excellent article for Faceless video: "Article/News".
        2. RELEVANCE: Ignore unrelated results.
        
        Return ONLY a JSON array:
        {"nombre": "Title", "tipo_contenido": "Long Video" or "Podcast/Audio" or "Article/News", "descripcion": "What it's about...", "potencial_viralidad": "Why...", "gancho": "What to do...", "url": "link"}
        Data: ${materiaPrima}`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
        
        const geminiResponse = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptGemini }] }],
                generationConfig: {
                    temperature: 0.4,
                    responseMimeType: "application/json" 
                }
            })
        });

        const geminiData = await geminiResponse.json();
        
        let textoRespuesta = "";
        if (geminiData.candidates && geminiData.candidates[0] && geminiData.candidates[0].content) {
            textoRespuesta = geminiData.candidates[0].content.parts[0].text || "[]";
        } else {
            // Si Gemini falla (ej. clave mala), mostramos el error real para que sepas qué pasa
            console.error("Error de Gemini:", JSON.stringify(geminiData));
            const errorMsg = geminiData.error?.message || "Error desconocido con Gemini";
            return res.status(500).json({ error: "Fallo Gemini: " + errorMsg });
        }

        let seriesAnalizadas;
        try {
            const jsonLimpio = textoRespuesta.replace(/```json/g, '').replace(/```/g, '').trim();
            seriesAnalizadas = JSON.parse(jsonLimpio);
            
            if (!Array.isArray(seriesAnalizadas) || seriesAnalizadas.length === 0) {
                return res.status(200).json({ series: respaldoSeguro });
            }
            
        } catch (parseError) {
            return res.status(200).json({ series: respaldoSeguro });
        }

        return res.status(200).json({ series: seriesAnalizadas });

    } catch (error) {
        console.error("Error general:", error);
        return res.status(500).json({ error: "Error de conexión: " + error.message });
    }
}
