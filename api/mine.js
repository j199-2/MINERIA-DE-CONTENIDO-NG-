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
    // NIVEL 1: DRAMAS (Sin cambios, funciona bien)
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
    // NIVEL 2: CLIPPING (Radar Semanal + Estratega Práctico + Red de Seguridad)
    // ==========================================================================================
    let queryTavily = "";
    if (nicho === 'salud') queryTavily = `${categoria} ${tiempo} podcast o video largo ${idiomaCompleto}`;
    else if (nicho === 'motivacion') queryTavily = `${categoria} ${tiempo} conferencia o podcast ${idiomaCompleto}`;
    else if (nicho === 'religion') queryTavily = `${categoria} ${tiempo} predica o estudio biblico ${idiomaCompleto}`;

    try {
        // FASE 1: RADAR AMPLIADO (De 24 horas a 7 días)
        const tavilyResponse = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tavilyKey}` },
            body: JSON.stringify({ 
                query: queryTavily, 
                search_depth: "advanced", 
                max_results: 10,
                time_range: "week" // CAMBIO CLAVE: Buscamos en la última semana
            })
        });

        const tavilyData = await tavilyResponse.json();
        if (!tavilyData.results || tavilyData.results.length === 0) {
            return res.status(200).json({ series: [] });
        }

        // Si algo falla con Groq, usaremos esto como respaldo
        const respaldoSeguro = tavilyData.results.map(item => ({
            nombre: item.title,
            gancho: idioma === 'es' ? "Materia prima encontrada. Revisa el enlace para buscar el minuto exacto a recortar." : "Raw material found. Check the link to find the exact minute to clip.",
            estado: "⚠️ Sin análisis",
            viralidad: "N/A",
            url: item.url
        }));

        const materiaPrima = tavilyData.results.map((item, i) => `Resultado ${i+1}:\nTitulo: ${item.title}\nContenido: ${item.content}\nURL: ${item.url}`).join("\n\n");

        // FASE 2: EL ESTRATEGA (Menos estricto, más práctico)
        const promptGroq = idioma === 'es' 
        ? `Eres un estratega de contenido para TikTok/Reels. Te voy a dar resultados de búsqueda de videos/podcasts de la última semana sobre "${categoria}".
        Tu trabajo es encontrar el potencial de clipping. 
        1. Si encuentras un "gancho" claro (polémica, revelación, dato fuerte), escríbelo.
        2. Si es un video informativo normal pero útil, dame una idea de qué parte resumir (ej. "Resumir los 3 primeros minutos").
        Devuelve ÚNICAMENTE un JSON array con máximo 5 resultados. Formato:
        {"nombre": "Título", "gancho": "Qué clippear y por qué", "estado": "🔥 Reciente", "viralidad": "Alta/Media", "url": "enlace"}
        Datos: ${materiaPrima}`
        : `You are a content strategist for TikTok/Reels. I will give you search results for videos/podcasts from the past week about "${categoria}".
        Your job is to find clipping potential.
        1. If you find a clear "hook" (controversy, reveal, strong fact), write it.
        2. If it's a normal but useful video, give me an idea of what part to summarize (eg "Summarize the first 3 minutes").
        Return ONLY a JSON array with max 5 results. Format:
        {"nombre": "Title", "gancho": "What to clip and why", "estado": "🔥 Recent", "viralidad": "High/Medium", "url": "link"}
        Data: ${materiaPrima}`;

        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json", 
                "Authorization": `Bearer ${groqKey}` 
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [{ role: "user", content: promptGroq }],
                temperature: 0.5
            })
        });

        const groqData = await groqResponse.json();
        
        // RED DE SEGURIDAD: Si Groq se confunde o falla, usamos el respaldo
        if (!groqData.choices || !groqData.choices[0] || !groqData.choices[0].message) {
            console.error("Groq falló, usando red de seguridad");
            return res.status(200).json({ series: respaldoSeguro });
        }

        const textoRespuesta = groqData.choices[0].message.content || "[]";        
        const jsonLimpio = textoRespuesta.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let seriesAnalizadas;
        try {
            seriesAnalizadas = JSON.parse(jsonLimpio);
            // Si por alguna razón Groq devolvió un objeto en vez de un array
            if (!Array.isArray(seriesAnalizadas)) {
                return res.status(200).json({ series: respaldoSeguro });
            }
        } catch (parseError) {
            // Si el JSON de Groq está roto, usamos el respaldo
            console.error("JSON roto de Groq, usando red de seguridad");
            return res.status(200).json({ series: respaldoSeguro });
        }

        return res.status(200).json({ series: seriesAnalizadas });

    } catch (error) {
        console.error("Error general en clipping:", error);
        return res.status(500).json({ error: "Error analizando contenido: " + error.message });
    }
}
