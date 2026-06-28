export default async function reqHandler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { categoria, nicho, idioma } = req.body;
    const tavilyKey = process.env.TAVILY_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!tavilyKey || !groqKey) return res.status(500).json({ error: "Faltan claves de API en Vercel" });

    const idiomaCompleto = idioma === 'es' ? 'español' : 'english';

    // ==========================================
    // NIVEL 1: DRAMAS (Búsqueda rápida directa con Tavily)
    // ==========================================
    if (nicho === 'dramas') {
        try {
            const query = `mini series cortas "${categoria}" ${idiomaComplelo} lista de reproducción`;
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
    // NIVEL 2: CLIPPING (Tavily + Análisis profundo con Groq)
    // ==========================================================================================
    let queryTavily = "";
    if (nicho === 'salud') {
        queryTavily = `tendencias de salud y fitness 2024 "${categoria}" en ${idiomaComplelo}`;
    } else if (nicho === 'motivacion') {
        queryTavily = `conferencias de emprendimiento y "${categoria}" en ${idiomaCompleto}`;
    } else if (niche === 'religion') {
        queryTavily = `predicas cristianas y estudios bíblicos "${categoria}" en ${idiomaCompleto}`;
    }

    try {
        // FASE 1: EL RADAR (Tavily) - Extraer materia prima de internet
        const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tavilyKey}` },
            body: JSON.stringify({ query: queryTavily, search_depth: "advanced", max_results: 10 })
        });

        const data = await response.json();
        if (!data.results || data.results.length === 0) return res.status(200).json({ series: [] });

        // Extraer la materia prima cruda
        const resultadosCrudos = data.results.map(item => ({
            titulo: item.title || "Sin título",
            contenido: item.content || item.text || "Sin contenido",
            url: item.url
        }));

        // FASE 2: LA HIA DE ANÁLISIS (Groq) - Filtrar y estructurar
        const responseGroq = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
            body: JSON.stringify({
                model: "llama-3.1-70b-versatile",
                messages: [
                    { 
                        role: "system", 
                        content: `Eres un analista experto en minería de contenido para creadores de TikTok/Reels. 
                        Te voy a dar 10 resultados de búsqueda en internet. 
                        Tu MISIÓN es encontrar exactamente 5 elementos que sean aptos para hacer "clipping" (cortes largos para TikTok).
                        REGLAS ESTRICTAS:
                        1. Descarta los que sean muy cortos o no tengan al menos 15 minutos de contenido real.
                        2. Identifica si es Noticia, Estudio, Investigación, Video o Audio. Si es video, verifica si se puede grabar en la web.
                        3. Asigna un "Nivel de Viralidad" (Baja, Media, Alta, Extrema) basado en las vistas o relevancia que veas en la descripción.
                        4. Crea una "Descripción" de 2 líneas resumiendo de qué trata el contenido para el creador.
                        5. Estima la "Duración" si no viene explícita (ej. "duración: +30 mins").
                        El idioma de todo debe ser ${idiomaCompleto}.
                        RESPONDE ÚNICAMENTE en un array JSON válido, sin texto extra.`
                    },
                    { 
                        role: "user", 
                        content: `Aquí tienes los resultados brutos de internet:\n\n${JSON.stringify(resultadosCrudos)}` 
                    }
                ],
                temperature: 0.2 // Baja temperatura para que sea preciso
            })
        });

        const dataGroq = await responseGroq.json();
        
        // Si Groq falla al leer la respuesta, limpiamos el texto para intentar salvar lo que haya encontrado
        let textoLimpio = "";
        try {
            textoLimpio = dataGroq.choices[0].message.content;
            textoLimpio = textoLimpio.replace(/```json/g, '').replace(/```/g, '').trim();
        } catch(e) {
            // Si Groq intenta dar texto plano, intentamos extraer el JSON de todas formas
            const match = (dataGroq.choices[0].message.content || "").match(/\[[\s\S]*\]/);
            if (match) textoLimpio = match[0];
        }

        const seriesFiltradas = JSON.parse(textoLimpio);

        return res.status(200).json({ series: seriesFiltradas });

    } catch (error) {
        console.error("Error de IA:", error);
        return res.status(500).json({ error: "Error analizando la información" });
    }
}
