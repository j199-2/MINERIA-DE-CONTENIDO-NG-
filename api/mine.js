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
    // NIVEL 1: DRAMAS (Se mantiene igual, funciona perfecto)
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
    // NIVEL 2: CLIPPING (Estrategia de Abundancia y Curaduría)
    // ==========================================================================================
    
    // Búsqueda abierta. Pedimos 15 resultados para que la IA tenga de dónde elegir.
    let queryTavily = `${categoria} video largo o podcast reciente ${idiomaCompleto} -tiktok -reels -shorts -instagram -facebook`;

    try {
        const tavilyResponse = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tavilyKey}` },
            body: JSON.stringify({ 
                query: queryTavily, 
                search_depth: "advanced", 
                max_results: 15, // Pedimos más material bruto
                time_range: "week"
            })
        });

        const tavilyData = await tavilyResponse.json();
        if (!tavilyData.results || tavilyData.results.length === 0) {
            return res.status(200).json({ series: [] });
        }

        const materiaPrima = tavilyData.results.map((item, i) => `Resultado ${i+1}:\nTitulo: ${item.title}\nContenido: ${item.content}\nURL: ${item.url}`).join("\n\n");

        // CEREBRO CURADOR: Ahora es un experto que separa el grano de la paja
        const promptGroq = idioma === 'es' 
        ? `Eres un Curador de Contenido Experto para creadores. Te voy a dar 15 resultados de búsqueda sobre "${categoria}".
        Tu trabajo es encontrar las 3 a 5 piezas de contenido MÁS VALIOSAS para hacer clipping (recortes para TikTok/Reels).
        
        INSTRUCCIONES DE CURADURÍA:
        1. IGNORA basura: No incluyas nada de TikTok, Reels, Shorts, Instagram o Facebook.
        2. FORMATO: 
           - Si es un video/podcast, etiquétalo como "Video Largo" o "Podcast/Audio".
           - Si es un ARTÍCULO o NOTICIA muy buena que sirva para hacer un video Faceless (sin cara), etiquétalo como "Artículo/Noticia".
        3. RELEVANCIA: Ignora resultados que no tengan nada que ver con "${categoria}".
        
        De los que selecciones, dame una descripción corta, por qué es viral y qué clippear o cómo usarlo.
        Devuelve ÚNICAMENTE un JSON array con los seleccionados:
        {"nombre": "Título", "tipo_contenido": "Video Largo" o "Podcast/Audio" o "Artículo/Noticia", "descripcion": "De qué va...", "potencial_viralidad": "Por qué...", "gancho": "Qué hacer...", "url": "enlace"}
        Datos: ${materiaPrima}`
        : `You are an Expert Content Curator for creators. I will give you 15 search results about "${categoria}".
        Your job is to find the 3 to 5 MOST VALUABLE pieces of content for clipping.
        
        CURATION INSTRUCTIONS:
        1. IGNORE trash: Do not include anything from TikTok, Reels, Shorts, Instagram, or Facebook.
        2. FORMAT: 
           - If it's a video/podcast, label it "Long Video" or "Podcast/Audio".
           - If it's a very good ARTICLE or NEWS that can be used for a Faceless video, label it "Article/News".
        3. RELEVANCE: Ignore results that have nothing to do with "${categoria}".
        
        For the ones you select, give a short description, why it's viral, and what to clip.
        Return ONLY a JSON array with the selected ones:
        {"nombre": "Title", "tipo_contenido": "Long Video" or "Podcast/Audio" or "Article/News", "descripcion": "What it's about...", "potencial_viralidad": "Why...", "gancho": "What to do...", "url": "link"}
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
        
        // Red de seguridad inteligente: Si la IA no devuelve nada útil, mostramos los primeros 5 de Tavily
        // para que la pantalla NUNCA esté vacía.
        const respaldoSeguro = tavilyData.results.slice(0, 5).map(item => ({
            nombre: item.title,
            tipo_contenido: "Contenido Encontrado",
            descripcion: "Materia prima de la semana.",
            potencial_viralidad: "Requiere análisis manual",
            gancho: "Revisa el enlace para extraer el clip.",
            url: item.url
        }));

        if (!groqData.choices || !groqData.choices[0] || !groqData.choices[0].message) {
            return res.status(200).json({ series: respaldoSeguro });
        }

        const textoRespuesta = groqData.choices[0].message.content || "[]";        
        const jsonLimpio = textoRespuesta.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let seriesAnalizadas;
        try {
            seriesAnalizadas = JSON.parse(jsonLimpio);
            
            // Si la IA se puso muy estricta y devolvió un array vacío, usamos el respaldo
            if (!Array.isArray(seriesAnalizadas) || seriesAnalizadas.length === 0) {
                return res.status(200).json({ series: respaldoSeguro });
            }
            
        } catch (parseError) {
            // Si la IA se equivoca de formato, usamos el respaldo
            return res.status(200).json({ series: respaldoSeguro });
        }

        return res.status(200).json({ series: seriesAnalizadas });

    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ error: "Error de conexión: " + error.message });
    }
}
