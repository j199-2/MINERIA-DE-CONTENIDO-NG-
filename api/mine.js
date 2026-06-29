export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { categoria, nicho, idioma } = req.body;
    const tavilyKey = process.env.TAVILY_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY; // Nueva llave

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
    // NIVEL 2: CLIPPING (Tavily busca + Gemini Curador con JSON Garantizado)
    // ==========================================================================================
    
    let queryTavily = `${categoria} video largo o podcast reciente ${idiomaCompleto} -tiktok -reels -shorts -instagram -facebook`;

    try {
        // 1. TAVILY: Extraer materia prima
        const tavilyResponse = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tavilyKey}` },
            body: JSON.stringify({ 
                query: queryTavily, 
                search_depth: "advanced", 
                max_results: 15,
                time_range: "week"
            })
        });

        const tavilyData = await tavilyResponse.json();
        if (!tavilyData.results || tavilyData.results.length === 0) {
            return res.status(200).json({ series: [] });
        }

        // Respaldo por si Gemini falla
        const respaldoSeguro = tavilyData.results.slice(0, 5).map(item => ({
            nombre: item.title,
            tipo_contenido: "Contenido Encontrado",
            descripcion: "Materia prima de la semana.",
            potencial_viralidad: "Requiere análisis manual",
            gancho: "Revisa el enlace para extraer el clip.",
            url: item.url
        }));

        const materiaPrima = tavilyData.results.map((item, i) => `Resultado ${i+1}:\nTitulo: ${item.title}\nContenido: ${item.content}\nURL: ${item.url}`).join("\n\n");

        // 2. GEMINI: El Curador Experto
        const promptGemini = idioma === 'es' 
        ? `Eres un Curador de Contenido Experto para creadores de TikTok/Reels. Te voy a dar 15 resultados de búsqueda sobre "${categoria}".
        Tu trabajo es encontrar las 3 a 5 piezas de contenido MÁS VALIOSAS para hacer clipping (recortes).
        
        INSTRUCCIONES DE CURADURÍA:
        1. IGNORA basura: No incluyas nada de TikTok, Reels, Shorts, Instagram o Facebook.
        2. FORMATO: 
           - Si es un video/podcast largo, etiquétalo como "Video Largo" o "Podcast/Audio".
           - Si es un ARTÍCULO o NOTICIA excelente que sirva para hacer un video Faceless (sin cara), etiquétalo como "Artículo/Noticia".
        3. RELEVANCIA: Ignora resultados que no tengan nada que ver con "${categoria}".
        
        De los que selecciones, dame una descripción corta, por qué es viral y qué clippear.
        Devuelve ÚNICAMENTE un JSON array con los seleccionados:
        {"nombre": "Título", "tipo_contenido": "Video Largo" o "Podcast/Audio" o "Artículo/Noticia", "descripcion": "De qué va...", "potencial_viralidad": "Por qué...", "gancho": "Qué hacer...", "url": "enlace"}
        Datos: ${materiaPrima}`
        : `You are an Expert Content Curator for TikTok/Reels creators. I will give you 15 search results about "${categoria}".
        Your job is to find the 3 to 5 MOST VALUABLE pieces of content for clipping.
        
        CURATION INSTRUCTIONS:
        1. IGNORE trash: Do not include anything from TikTok, Reels, Shorts, Instagram, or Facebook.
        2. FORMAT: 
           - If it's a long video/podcast, label it "Long Video" or "Podcast/Audio".
           - If it's an excellent ARTICLE or NEWS that can be used for a Faceless video, label it "Article/News".
        3. RELEVANCE: Ignore results that have nothing to do with "${categoria}".
        
        For the ones you select, give a short description, why it's viral, and what to clip.
        Return ONLY a JSON array with the selected ones:
        {"nombre": "Title", "tipo_contenido": "Long Video" or "Podcast/Audio" or "Article/News", "descripcion": "What it's about...", "potencial_viralidad": "Why...", "gancho": "What to do...", "url": "link"}
        Data: ${materiaPrima}`;

        // Llamada a la API de Gemini (Usando el modelo Flash que es rapidísimo y gratis)
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
        
        const geminiResponse = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptGemini }] }],
                generationConfig: {
                    temperature: 0.4,
                    // LA MAGIA DE GEMINI: Le obligamos a que la respuesta SEA un JSON válido, sin textos extra
                    responseMimeType: "application/json" 
                }
            })
        });

        const geminiData = await geminiResponse.json();
        
        // Extraer el texto de la respuesta de Gemini
        let textoRespuesta = "";
        if (geminiData.candidates && geminiData.candidates[0] && geminiData.candidates[0].content && geminiData.candidates[0].content.parts) {
            textoRespuesta = geminiData.candidates[0].content.parts[0].text || "[]";
        } else {
            // Si Gemini tiene un error de seguridad o de formato, lanzamos el respaldo
            console.error("Error en la estructura de Gemini:", JSON.stringify(geminiData));
            return res.status(200).json({ series: respaldoSeguro });
        }

        let seriesAnalizadas;
        try {
            // Como usamos responseMimeType, Gemini ya no pone los ```json```, pero limpiamos por si acaso
            const jsonLimpio = textoRespuesta.replace(/```json/g, '').replace(/```/g, '').trim();
            seriesAnalizadas = JSON.parse(jsonLimpio);
            
            // Si por alguna razón devuelve vacío, lanzamos el respaldo
            if (!Array.isArray(seriesAnalizadas) || seriesAnalizadas.length === 0) {
                return res.status(200).json({ series: respaldoSeguro });
            }
            
        } catch (parseError) {
            console.error("Error parseando JSON de Gemini:", parseError);
            return res.status(200).json({ series: respaldoSeguro });
        }

        return res.status(200).json({ series: seriesAnalizadas });

    } catch (error) {
        console.error("Error general:", error);
        return res.status(500).json({ error: "Error de conexión: " + error.message });
    }
}
