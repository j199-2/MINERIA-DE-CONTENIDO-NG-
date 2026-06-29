export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { categoria, nicho, idioma } = req.body;
    const tavilyKey = process.env.TAVILY_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!tavilyKey || !groqKey) {
        return res.status(500).json({ error: "Error: Faltan las claves API en Vercel." });
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
    // NIVEL 2: CLIPPING (Zona Dulce: Simple, directo y bloqueando lo malo)
    // ==========================================================================================
    
    // Buscamos la categoría exacta en video o podcast, bloqueando textualmente lo que no queremos
    let queryTavily = `"${categoria}" (video OR podcast OR "video largo") ${idiomaCompleto} -tiktok -reels -shorts -instagram -facebook -noticia -blog`;

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

        const materiaPrima = tavilyData.results.map((item, i) => `Resultado ${i+1}:\nTitulo: ${item.title}\nContenido: ${item.content}\nURL: ${item.url}`).join("\n\n");

        // CEREBRO ESTRATEGA (Enfoque en RELEVANCIA)
        const promptGroq = idioma === 'es' 
        ? `Eres un Estratega de Clipping. Analiza estos resultados sobre "${categoria}".
        REGLAS ESTRICTAS DE SUPERVIVENCIA:
        1. RELEVANCIA: Si el resultado NO trata específicamente de "${categoria}" (ej: busqué salud y es política), BÓRRALO.
        2. FORMATO: Solo permite "Video Largo" o "Podcast/Audio". Si es un artículo de texto, BÓRRALO.
        3. REDES PROHIBIDAS: Si la URL es de TikTok, Instagram o Facebook, BÓRRALO.
        4. Para los que sobrevivan, dame la descripción, el potencial viral y qué minuto clippear.
        Devuelve ÚNICAMENTE un JSON array (máx 5):
        {"nombre": "Título", "tipo_contenido": "Video Largo" o "Podcast/Audio", "descripcion": "De qué va...", "potencial_viralidad": "Por qué...", "gancho": "Qué hacer...", "url": "enlace"}
        Datos: ${materiaPrima}`
        : `You are a Clipping Strategist. Analyze these results about "${categoria}".
        STRICT SURVIVAL RULES:
        1. RELEVANCE: If the result is NOT specifically about "${categoria}" (eg: searched health but it's politics), DELETE IT.
        2. FORMAT: Only allow "Long Video" or "Podcast/Audio". If it's a text article, DELETE IT.
        3. FORBIDDEN NETWORKS: If the URL is from TikTok, Instagram, or Facebook, DELETE IT.
        4. For survivors, give description, viral potential, and what minute to clip.
        Return ONLY a JSON array (max 5):
        {"nombre": "Title", "tipo_contenido": "Long Video" or "Podcast/Audio", "descripcion": "What it's about...", "potencial_viralidad": "Why...", "gancho": "What to do...", "url": "link"}
        Data: ${materiaPrima}`;

        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [{ role: "user", content: promptGroq }],
                temperature: 0.3
            })
        });

        const groqData = await groqResponse.json();
        
        if (!groqData.choices || !groqData.choices[0] || !groqData.choices[0].message) {
            return res.status(200).json({ series: [] }); // Si falla, mejor vacío que error
        }

        const textoRespuesta = groqData.choices[0].message.content || "[]";        
        const jsonLimpio = textoRespuesta.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let seriesAnalizadas;
        try {
            seriesAnalizadas = JSON.parse(jsonLimpio);
            if (!Array.isArray(seriesAnalizadas)) seriesAnalizadas = [];
        } catch (parseError) {
            seriesAnalizadas = [];
        }

        return res.status(200).json({ series: seriesAnalizadas });

    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ error: "Error de conexión: " + error.message });
    }
}
