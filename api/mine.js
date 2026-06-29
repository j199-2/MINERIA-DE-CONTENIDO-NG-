export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { categoria, nicho, idioma } = req.body;
    const tavilyKey = process.env.TAVILY_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!tavilyKey || !groqKey) {
        return res.status(500).json({ error: "Error: Faltan claves API." });
    }

    const idiomaCompleto = idioma === 'es' ? 'español' : 'english';

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

    let queryTavily = `${categoria} video largo o podcast reciente ${idiomaCompleto}`;

    try {
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
        if (!tavilyData.results || tavilyData.results.length === 0) return res.status(200).json({ series: [] });

        const respaldoSeguro = tavilyData.results.slice(0, 5).map(item => ({
            nombre: item.title, tipo_contenido: "Contenido Encontrado", descripcion: "Materia prima.", potencial_viralidad: "Requiere análisis", gancho: "Revisa el enlace.", url: item.url
        }));

        const materiaPrima = tavilyData.results.map((item, i) => `Resultado ${i+1}:\nTitulo: ${item.title}\nContenido: ${item.content}\nURL: ${item.url}`).join("\n\n");

        const promptGroq = idioma === 'es' 
        ? `Eres un Curador Experto. Encuentra las 3 a 5 piezas MÁS VALIOSAS sobre "${categoria}" para clipping.
        FORMATO: Si es video/podcast: "Video Largo" o "Podcast/Audio". Si es artículo: "Artículo/Noticia".
        RELEVANCIA: Ignora lo que no sea sobre "${categoria}".
        Devuelve ÚNICAMENTE un JSON: {"resultados": [{"nombre": "Título", "tipo_contenido": "Video Largo", "descripcion": "De qué va...", "potencial_viralidad": "Por qué...", "gancho": "Qué hacer...", "url": "enlace"}]}
        Datos: ${materiaPrima}`
        : `You are an Expert Curator. Find the 3 to 5 MOST VALUABLE pieces about "${categoria}" for clipping.
        FORMAT: If video/podcast: "Long Video" or "Podcast/Audio". If article: "Article/News".
        RELEVANCE: Ignore unrelated results.
        Return ONLY a JSON: {"resultados": [{"nombre": "Title", "tipo_contenido": "Long Video", "descripcion": "About...", "potencial_viralidad": "Why...", "gancho": "What to do...", "url": "link"}]}
        Data: ${materiaPrima}`;

        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: promptGroq }],
                temperature: 0.3,
                response_format: { type: "json_object" } 
            })
        });

        const groqData = await groqResponse.json();
        
        if (!groqData.choices || !groqData.choices[0] || !groqData.choices[0].message) {
            return res.status(500).json({ error: "Fallo Groq: " + (groqData.error?.message || "Error") });
        }

        const textoRespuesta = groqData.choices[0].message.content || "{}";
        let seriesAnalizadas;
        try {
            const parseado = JSON.parse(textoRespuesta);
            seriesAnalizadas = parseado.resultados || [];
            if (!Array.isArray(seriesAnalizadas) || seriesAnalizadas.length === 0) {
                return res.status(200).json({ series: respaldoSeguro });
            }
        } catch (parseError) {
            return res.status(200).json({ series: respaldoSeguro });
        }

        return res.status(200).json({ series: seriesAnalizadas });

    } catch (error) {
        return res.status(500).json({ error: "Error: " + error.message });
    }
}
