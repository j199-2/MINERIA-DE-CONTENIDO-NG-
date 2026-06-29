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
    // NIVEL 1: DRAMAS (Mantiene su lógica propia)
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
    // NIVEL 2: CLIPPING (La Santísima Trinidad: YouTube + Rumble + Odysee)
    // ==========================================================================================
    let queryTavily = "";
    
    // Añadimos Rumble y Odysee directamente en la búsqueda para que Tavily priorice esas fuentes
    if (nicho === 'salud') {
        queryTavily = `${categoria} ${tiempo} (youtube OR rumble OR odysee OR podcast OR blog) ${idiomaCompleto} -tiktok -reels -shorts -instagram -facebook`;
    } else if (nicho === 'motivacion') {
        queryTavily = `${categoria} ${tiempo} (youtube OR rumble OR odysee OR podcast OR blog) ${idiomaCompleto} -tiktok -reels -shorts -instagram -facebook`;
    } else if (nicho === 'religion') {
        queryTavily = `${categoria} ${tiempo} (youtube OR rumble OR odysee OR podcast OR sermon) ${idiomaCompleto} -tiktok -reels -shorts -instagram -facebook`;
    }

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

        // Red de seguridad por si la IA se confunde
        const respaldoSeguro = tavilyData.results.map(item => ({
            nombre: item.title,
            tipo_contenido: "Video Largo",
            descripcion: "Materia prima encontrada. Revisa el enlace.",
            potencial_viralidad: "Por verificar",
            gancho: "Revisa el contenido para encontrar el ángulo.",
            url: item.url
        }));

        const materiaPrima = tavilyData.results.map((item, i) => `Resultado ${i+1}:\nTitulo: ${item.title}\nContenido: ${item.content}\nURL: ${item.url}`).join("\n\n");

        // CEREBRO ESTRATEGA: Actualizado para saber que viene de Rumble u Odysee
        const promptGroq = idioma === 'es' 
        ? `Eres un Estratega de Clipping Experto. Analiza estos resultados de la última semana sobre "${categoria}".
        Las fuentes principales son YouTube, Rumble y Odysee (videos largos), además de podcasts y blogs.
        REGLAS ESTRICTAS:
        1. FORMATO: Identifica si es "Video Largo" (YouTube/Rumble/Odysee), "Podcast/Audio", o "Artículo/Noticia".
        2. LEY ESTRICTA: DESCARTA cualquier cosa que sea de TikTok, Reels, Shorts, Instagram, Facebook o menores a 15 minutos.
        3. DESCRIPCIÓN: Explica claramente de qué trata el contenido (2 líneas).
        4. POTENCIAL VIRAL: Explica por qué este material sin censura o de larga duración ganará atención (1 línea).
        5. GANCHO: Si es video, di qué minuto clippear. Si es artículo, di cómo convertirlo en video.
        Devuelve ÚNICAMENTE un JSON array con máximo 5 resultados EXACTAMENTE con esta estructura:
        {"nombre": "Título", "tipo_contenido": "Video Largo" o "Podcast/Audio" o "Artículo/Noticia", "descripcion": "De qué va...", "potencial_viralidad": "Por qué ganará...", "gancho": "Qué hacer...", "url": "enlace"}
        Datos: ${materiaPrima}`
        : `You are an Expert Clipping Strategist. Analyze these results from the past week about "${categoria}".
        Main sources are YouTube, Rumble, and Odysee (long videos), plus podcasts and blogs.
        STRICT RULES:
        1. FORMAT: Identify if it's "Long Video" (YouTube/Rumble/Odysee), "Podcast/Audio", or "Article/News".
        2. STRICT LAW: DISCARD anything from TikTok, Reels, Shorts, Instagram, Facebook, or under 15 mins.
        3. DESCRIPTION: Explain clearly what the content is about (2 lines).
        4. VIRAL POTENTIAL: Explain why this uncensored/long-form material will gain attention (1 line).
        5. HOOK: If it's a video, say what minute to clip. If it's an article, say how to turn it into a video.
        Return ONLY a JSON array with max 5 results EXACTLY with this structure:
        {"nombre": "Title", "tipo_contenido": "Long Video" or "Podcast/Audio" or "Article/News", "descripcion": "What it's about...", "potencial_viralidad": "Why it will win...", "gancho": "What to do...", "url": "link"}
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
