export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { categoria, nicho, idioma } = req.body;
    const tavilyKey = process.env.TAVILY_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!tavilyKey || !groqKey) {
        return res.status(500).json({ error: "Error: Faltan TAVILY_API_KEY o GROQ_API_KEY en Vercel." });
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
    // NIVEL 2: CLIPPING (Tavily + Groq Cerebro Grande 70B con JSON Mode)
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
                exclude_domains: ["instagram.com", "facebook.com", "tiktok.com", "twitter.com", "x.com"]
            })
        });

        const tavilyData = await tavilyResponse.json();
        if (!tavilyData.results || tavilyData.results.length === 0) {
            return res.status(200).json({ series: [] });
        }

        const respaldoSeguro = tavilyData.results.slice(0, 5).map(item => ({
            nombre: item.title,
            tipo_contenido: "Contenido Encontrado",
            descripcion: "Materia prima de la semana.",
            potencial_viralidad: "Requiere análisis manual",
            gancho: "Revisa el enlace para extraer el clip.",
            url: item.url
        }));

        const materiaPrima = tavilyData.results.map((item, i) => `Resultado ${i+1}:\nTitulo: ${item.title}\nContenido: ${item.content}\nURL: ${item.url}`).join("\n\n");

        // 2. GROQ CEREBRO GRANDE (70B)
        const promptGroq = idioma === 'es' 
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

        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json", 
                "Authorization": `Bearer ${groqKey}` 
            },
            body: JSON.stringify({
                // EL SECRETO: Usamos el modelo de 70 Billones de parámetros. Es super inteligente.
                model: "llama-3.1-70b-versatile",
                messages: [{ role: "user", content: promptGroq }],
                temperature: 0.3,
                // EL DOBLE SECRETO: Forzamos JSON Mode. Es imposible que falle el formato.
                response_format: { type: "json_object" } 
            })
        });

        const groqData = await groqResponse.json();
        
        let textoRespuesta = "";
        if (groqData.choices && groqData.choices[0] && groqData.choices[0].message) {
            textoRespuesta = groqData.choices[0].message.content || "{}";
        } else {
            console.error("Error de Groq:", JSON.stringify(groqData));
            return res.status(500).json({ error: "Fallo Groq: " + (groqData.error?.message || "Error desconocido") });
        }

        let seriesAnalizadas;
        try {
            // Como usamos JSON mode, viene limpio, pero limpiamos por si acaso
            const jsonLimpio = textoRespuesta.replace(/```json/g, '').replace(/```/g, '').trim();
            const parseado = JSON.parse(jsonLimpio);
            
            // Como usamos json_object, devuelve un objeto, no un array. Extraemos el array.
            seriesAnalizadas = parseado.data || parseado.resultados || parseado.results || parseado;
            
            if (!Array.isArray(seriesAnalizadas) || seriesAnalizadas.length === 0) {
                return res.status(200).json({ series: respaldoSeguro });
            }
            
        } catch (parseError) {
            console.error("Error parseando:", parseError);
            return res.status(200).json({ series: respaldoSeguro });
        }

        return res.status(200).json({ series: seriesAnalizadas });

    } catch (error) {
        console.error("Error general:", error);
        return res.status(500).json({ error: "Error de conexión: " + error.message });
    }
}
