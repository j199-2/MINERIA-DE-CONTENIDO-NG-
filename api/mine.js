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
    // NIVEL 2: CLIPPING (Filtros de Hierro)
    // ==========================================================================================
    
    // FILTRO 1: Palabras clave para forzar contenido largo y NEGAR shorts/reels
    let queryTavily = "";
    if (nicho === 'salud') queryTavily = `"${categoria}" ${tiempo} "video largo" OR podcast OR "entrevista completa" ${idiomaCompleto} -tiktok -reels -shorts`;
    else if (nicho === 'motivacion') queryTavily = `"${categoria}" ${tiempo} conferencia OR podcast OR "entrevista completa" ${idiomaCompleto} -tiktok -reels -shorts`;
    else if (nicho === 'religion') queryTavily = `"${categoria}" ${tiempo} predica OR "estudio biblico completo" OR sermon ${idiomaCompleto} -tiktok -reels -shorts`;

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
            gancho: idioma === 'es' ? "Materia prima. Revisa si es video o texto." : "Raw material. Check if it's video or text.",
            estado: "⚠️ Sin análisis",
            viralidad: "N/A",
            url: item.url
        }));

        const materiaPrima = tavilyData.results.map((item, i) => `Resultado ${i+1}:\nTitulo: ${item.title}\nContenido: ${item.content}\nURL: ${item.url}`).join("\n\n");

        // FILTRO 2: El prompt con reglas estrictas para Groq
        const promptGroq = idioma === 'es' 
        ? `Eres un editor jefe de contenido para clipping. Te doy resultados sobre "${categoria}".
        REGLAS ESTRICTAS:
        1. PROHIBIDO traer TikToks, Reels o Shorts. Solo contenido largo.
        2. Debes analizar SI ES VIDEO o SI ES ARTÍCULO/NOTICIA escrito.
        3. En el campo "gancho" DEBES hacer dos cosas:
           - A) Describir brevemente de qué trata el contenido.
           - B) Enmarcar el potencial de viralidad (Ej: "Es viral porque contradice lo que todos piensan" o "Es viral porque muestra un antes y después drástico").
        4. En el campo "estado":
           - Si es un video/podcast, pon EXACTAMENTE: "🎬 Video/Podcast"
           - Si es un blog/noticia/artículo, pon EXACTAMENTE: "📝 Artículo/Escrito (No es video)"
        5. Si el contenido no sirve para nada, no lo incluyas.
        Devuelve ÚNICAMENTE un JSON array con máximo 5 resultados.
        Formato exacto: {"nombre": "Título", "gancho": "Descripción + Potencial de viralidad", "estado": "🎬 Video/Podcast o
