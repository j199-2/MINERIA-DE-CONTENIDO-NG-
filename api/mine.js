export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { categoria, nicho, idioma } = req.body;
    const tavilyKey = process.env.TAVILY_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!tavilyKey || !groqKey) {
        return res.status(500).json({ error: "Error crítico: Faltan las claves API (TAVILY o GROQ) en Vercel. Ve a Settings > Environment Variables y agrúpalas." });
    }

    const idiomaCompleto = idioma === 'es' ? 'español' : 'english';

    // ==========================================
    // NIVEL 1: DRAMAS (Búsqueda rápida y directa)
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
    // NIVEL 2: SALUD, MOTIVACIÓN, RELIGIÓN (Tavily busca en internet + Groq analiza la información)
    // ==========================================================================================
    let queryTavily = "";
    if (nicho === 'salud') queryTavily = `tendencias de salud y fitness "${categoria}" en ${idiomaCompleto} youtube`;
    else if (nicho === 'motivacion') queryTavily = `conferencias de emprendimiento "${categoria}" en ${idiomaCompleto} youtube`;
    else if (nicho === 'religion') queryTavily = `predicas cristianas "${categoria}" en ${idiomaCompleto} youtube`;

    try {
        // FASE 1: El Radar (Buscar materia prima en internet)
        const tavilyResponse = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tavilyKey}` },
            body: JSON.stringify({ query: queryTavily, search_depth: "advanced", max_results: 8 })
        });

        const tavilyData = await tavilyResponse.json();
        if (!tavilyData.results || tavilyData.results.length === 0) {
            return res.status(200).json({ series: [] });
        }

        // Preparamos la información para enviársela al analista (Groq)
        const materiaPrima = tavilyData.results.map((item, i) => `Resultado ${i+1}:\nTitulo: ${item.title}\nContenido: ${item.content}\nURL: ${item.url}`).join("\n\n");

        // FASE 2: El Analista (Groq filtra y ordena los datos)
        const promptGroq = `Eres un experto en minería de contenido para creadores. Te voy a dar resultados de búsqueda de internet. 
Tu trabajo es filtrar solo los que sirven para hacer "clipping" (videos largos de al menos 15 minutos, o estudios/profundizaciones). 
Descarta noticias breves o artículos sin video.
Devuelve UNICAMENTE un JSON array (sin texto antes ni después) con máximo 5 resultados. 
Cada objeto debe tener exactamente esta estructura: 
{"nombre": "Titulo limpio", "tipo": "Video/Podcast/Estudio", "duracion": "+15 mins", "descripcion": "Resumen de 2 líneas de qué trata", "viralidad": "Alta/Media/Baja según el título", "url": "el enlace real"}
Aquí están los resultados:
 ${materiaPrima}`;

        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json", 
                "Authorization": `Bearer ${groqKey}` 
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant", // Modelo rápido y gratuito
                messages: [{ role: "user", content: promptGroq }],
                temperature: 0.3
            })
        });

        const groqData = await groqResponse.json();
        const textoRespuesta = groqData.choices[0]?.message?.content || "[]";
        
        // Limpiar la respuesta por si Groq pone caracteres extraños
        const jsonLimpio = textoRespuesta.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let seriesAnalizadas;
        try {
            seriesAnalizadas = JSON.parse(jsonLimpio);
        } catch (parseError) {
            return res.status(500).json({ error: "La IA no pudo leer los datos. Intenta de nuevo." });
        }

        return res.status(200).json({ series: seriesAnalizadas });

    } catch (error) {
        console.error("Error en clipping:", error);
        return res.status(500).json({ error: "Error analizando contenido: " + error.message });
    }
}
