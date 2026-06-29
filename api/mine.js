export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { categoria, nicho, idioma } = req.body;
    const tavilyKey = process.env.TAVILY_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!tavilyKey || !groqKey) {
        return res.status(500).json({ error: "Error: Faltan las claves API en Vercel." });
    }

    const idiomaCompleto = idioma === 'es' ? 'español' : 'english';
    const tiempo = idioma === 'es' ? 'subido hoy' : 'uploaded today';

    // ==========================================
    // NIVEL 1: DRAMAS (Búsqueda rápida de listas)
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
    // NIVEL 2: CLIPPING (El Cazador de Ganchos en Tiempo Real)
    // ==========================================================================================
    let queryTavily = "";
    if (nicho === 'salud') queryTavily = `${categoria} ${tiempo} podcast o video largo ${idiomaCompleto}`;
    else if (nicho === 'motivacion') queryTavily = `${categoria} ${tiempo} conferencia o podcast ${idiomaCompleto}`;
    else if (nicho === 'religion') queryTavily = `${categoria} ${tiempo} predica o estudio biblico ${idiomaCompleto}`;

    try {
        // FASE 1: RADAR DE ESTRENOS (Solo cosas de hoy)
        const tavilyResponse = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tavilyKey}` },
            body: JSON.stringify({ 
                query: queryTavily, 
                search_depth: "advanced", 
                max_results: 10,
                time_range: "day" // LA CLAVE: Solo trae lo de las últimas 24 horas
            })
        });

        const tavilyData = await tavilyResponse.json();
        if (!tavilyData.results || tavilyData.results.length === 0) {
            return res.status(200).json({ series: [] });
        }

        const materiaPrima = tavilyData.results.map((item, i) => `Resultado ${i+1}:\nTitulo: ${item.title}\nContenido: ${item.content}\nURL: ${item.url}`).join("\n\n");

        // FASE 2: EL OJEADOR (Groq buscando el Gancho perfecto para TikTok)
        const promptGroq = idioma === 'es' 
        ? `Eres un "Cazador de Ganchos" experto para TikTok/Reels. Tu misión es encontrar material de video largo (más de 15 minutos) que se haya subido en las últimas 24 horas y que tenga potencial para hacer CLIPPING.
        Reglas estrictas:
        1. DESCARTA cualquier resultado que sea un artículo corto o no tenga video.
        2. DESCARTA cualquier resultado que no tenga un "gancho" claro (una polémica, una revelación, un error famoso, un dato impactante).
        3. Si no hay nada que valga la pena, devuelve un array vacío [].
        Devuelve ÚNICAMENTE un JSON array con máximo 5 resultados. Formato:
        {"nombre": "Título", "gancho": "Explica en 2 líneas QUÉ momento exacto clippear y por qué explotará (Ej: Minuto 4:20 revela...)", "estado": "🔥 Acaba de subir", "viralidad": "Alta/Media", "url": "enlace"}
        Datos: ${materiaPrima}`
        : `You are an expert "Hook Hunter" for TikTok/Reels. Your mission is to find long-form video material (15+ mins) uploaded in the last 24 hours with high CLIPPING potential.
        Strict rules:
        1. DISCARD any short articles or non-video content.
        2. DISCARD anything without a clear "hook" (controversy, reveal, mistake, shocking fact).
        3. If nothing is good enough, return an empty array [].
        Return ONLY a JSON array with max 5 results. Format:
        {"nombre": "Title", "gancho": "Explain in 2 lines WHAT exact moment to clip and why it will go viral (Eg: Minute 4:20 reveals...)", "estado": "🔥 Just uploaded", "viralidad": "High/Medium", "url": "link"}
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
                temperature: 0.4
            })
        });

        const groqData = await groqResponse.json();
        const textoRespuesta = groqData.choices[0]?.message?.content || "[]";
        
        const jsonLimpio = textoRespuesta.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let seriesAnalizadas;
        try {
            seriesAnalizadas = JSON.parse(jsonLimpio);
        } catch (parseError) {
            return res.status(200).json({ series: [] }); // Si la IA se confunde, mejor mostrar vacío que error
        }

        return res.status(200).json({ series: seriesAnalizadas });

    } catch (error) {
        console.error("Error en clipping:", error);
        return res.status(500).json({ error: "Error analizando contenido: " + error.message });
    }
}
