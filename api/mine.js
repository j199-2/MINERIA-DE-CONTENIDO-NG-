export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { categoria, nicho, idioma } = req.body;
    const tavilyKey = process.env.TAVILY_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!tavilyKey || !groqKey) {
        return res.status(500).json({ error: "Error: Faltan las claves API en Vercel." });
    }

    const idiomaCompleto = idioma === 'es' ? 'español' : 'english';
    const tiempo = idioma === 'es' ? 'esta semana' : 'this week';

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
                nombre: item.title, 
                genero: categoria, 
                capitulos: "5+", 
                viralidad: "Alta", 
                url: item.url 
            }));
            return res.status(200).json({ series });
        } catch (error) {
            return res.status(500).json({ error: "Error buscando dramas: " + error.message });
        }
    }

    // ==========================================================================================
    // NIVEL 2: CLIPPING (Filtro Anti-Shorts, Pro-Artículos y Análisis Profundo)
    // ==========================================================================================
    let queryTavily = "";
    // ELIMINAMOS TIKTOK Y REELS. Buscamos YouTube largo, Podcasts, Blogs y Noticias.
    if (nicho === 'salud') queryTavily = `${categoria} ${tiempo} (youtube OR podcast OR blog OR noticia) ${idiomaCompleto} -tiktok -reels -shorts`;
    else if (nicho === 'motivacion') queryTavily = `${categoria} ${tiempo} (youtube OR podcast OR blog OR noticia) ${idiomaCompleto} -tiktok -reels -shorts`;
    else if (nicho === 'religion') queryTavily = `${categoria} ${tiempo} (youtube OR podcast OR blog OR sermon) ${idiomaCompleto} -tiktok -reels -shorts`;

    try {
        const tavilyResponse = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tavilyKey}` },
            body: JSON.stringify({ 
                query: queryTavily, 
                search_depth: "advanced", 
                max_results: 10,
                time_range: "week"
            })
        });

        const tavilyData = await tavilyResponse.json();
        if (!tavilyData.results || tavilyData.results.length === 0) {
            return res.status(200).json({ series: [] });
        }

        // Red de seguridad por si Groq falla
        const respaldoSeguro = tavilyData.results.map(item => ({
            nombre: item.title,
            tipo_contenido: "Desconocido",
            descripcion: "Materia prima encontrada. Revisa el enlace.",
            potencial_viralidad: "Por verificar",
            gancho: "Revisa el contenido para encontrar el ángulo.",
            estado: "⚠️ Sin análisis",
            url: item.url
        }));

        const materiaPrima = tavilyData.results.map((item, i) => `Resultado ${i+1}:\nTitulo: ${item.title}\nContenido: ${item.content}\nURL: ${item.url}`).join("\n\n");

        // NUEVO PROMPT: Estratega que distingue Videos de Textos y analiza a fondo
        const promptGroq = idioma === 'es' 
        ? `Eres un Estratega de Contenido Experto. Analiza estos resultados de la última semana sobre "${categoria}".
        REGLAS ESTRICTAS:
        1. IDENTIFICA EL FORMATO: Debes decir si es "Video Largo/Podcast" o "Artículo/Noticia".
        2. DESCARTA cualquier cosa que sea de TikTok, Reels, Shorts o menores a 15 minutos (a menos que sea un artículo de alto valor).
        3. DESCRIPCIÓN: Explica claramente de qué trata el contenido (2 líneas).
        4. POTENCIAL VIRAL: Explica por qué la gente haría clic o compartiría esto (1 línea).
        5. GANCHO: Si es video, di qué minuto clippear. Si es artículo, di cómo convertirlo en video.
        Devuelve ÚNICAMENTE un JSON array con máximo 5 resultados EXACTAMENTE con esta estructura:
        {"nombre": "Título", "tipo_contenido": "Video Largo" o "Artículo/Noticia", "descripcion": "De qué va...", "potencial_viralidad": "Por qué explotará...", "gancho": "Qué hacer...", "url": "enlace"}
        Datos: ${materiaPrima}`
        : `You are an Expert Content Strategist. Analyze these results from the past week about "${categoria}".
        STRICT RULES:
        1. IDENTIFY FORMAT: You must say if it is "Long Video/Podcast" or "Article/News".
        2. DISCARD anything from TikTok, Reels, Shorts, or under 15 mins (unless it's a high-value article).
        3. DESCRIPTION: Explain clearly what the content is about (2 lines).
        4. VIRAL POTENTIAL: Explain why people would click or share this (1 line).
        5. HOOK: If it's a video, say what minute to clip. If it's an article, say how to turn it into a video.
        Return ONLY a JSON array with max 5 results EXACTLY with this structure:
        {"nombre": "Title", "tipo_contenido": "Long Video" or "Article/News", "descripcion": "What it's about...", "potencial_viralidad": "Why it will go viral...", "gancho": "What to do...", "url": "link"}
        Data: ${materiaPrima}`;

        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [{ role: "user", content: promptGroq }],
                temperature: 0.4
            })
        });

        const groqData = await groqResponse.json();
        
        if (!groqData.choices || !groqData.choices[0] || !groqData.choices[0].message) {
            return res.status(200).json({ series: respaldoSeguro });
        }

        const textoRespuesta = groqData.choices[0].message.content || "[]";        
        const jsonLimpio = textoRespuesta.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let seriesAnalizadas;
        try {
            seriesAnalizadas = JSON.parse(jsonLimpio);
            if (!Array.isArray(seriesAnalizadas)) {
                return res.status(200).json({ series: respaldoSeguro });
            }
        } catch (parseError) {
            return res.status(200).json({ series: respaldoSeguro });
        }

        return res.status(200).json({ series: seriesAnalizadas });

    } catch (error) {
        console.error("Error general en clipping:", error);
        return res.status(500).json({ error: "Error analizando contenido: " + error.message });
    }
}
