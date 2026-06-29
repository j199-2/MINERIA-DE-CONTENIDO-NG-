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
                nombre: item.title, genero: categoria, capitulos: "5+", viralidad: "Alta", url: item.url 
            }));
            return res.status(200).json({ series });
        } catch (error) {
            return res.status(500).json({ error: "Error buscando dramas: " + error.message });
        }
    }

    // ==========================================================================================
    // NIVEL 2: CLIPPING (Ley de Hierro: SOLO Videos y Audio. Cero Artículos, Cero Instagram)
    // ==========================================================================================
    let queryTavily = "";
    
    // LEY DE HIERRO EN LA BÚSQUEDA: Quitamos "blog" y "noticia". 
    // Triple bloqueo a Instagram por si Tavily es terco.
    if (nicho === 'salud') {
        queryTavily = `${categoria} ${tiempo} (youtube OR rumble OR odysee OR podcast) ${idiomaCompleto} -tiktok -reels -shorts -instagram -"www.instagram.com" -"instagram.com" -facebook`;
    } else if (nicho === 'motivacion') {
        queryTavily = `${categoria} ${tiempo} (youtube OR rumble OR odysee OR podcast) ${idiomaCompleto} -tiktok -reels -shorts -instagram -"www.instagram.com" -"instagram.com" -facebook`;
    } else if (nicho === 'religion') {
        queryTavily = `${categoria} ${tiempo} (youtube OR rumble OR odysee OR podcast OR sermon) ${idiomaCompleto} -tiktok -reels -shorts -instagram -"www.instagram.com" -"instagram.com" -facebook`;
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

        // Filtrado físico por si acaso Tavily fue un desastre y dejó pasar algo
        const resultadosLimpios = tavilyData.results.filter(item => {
            const url = item.url.toLowerCase();
            // Destruir cualquier enlace de Instagram, TikTok o Facebook que haya pasado
            if (url.includes('instagram.com') || url.includes('tiktok.com') || url.includes('facebook.com')) return false;
            return true;
        });

        if (resultadosLimpios.length === 0) {
            return res.status(200).json({ series: [] });
        }

        const respaldoSeguro = resultadosLimpios.map(item => ({
            nombre: item.title,
            tipo_contenido: "Video Largo",
            descripcion: "Video o audio encontrado. Revisa el enlace.",
            potencial_viralidad: "Por verificar",
            gancho: "Revisa el contenido para encontrar el ángulo.",
            url: item.url
        }));

        const materiaPrima = resultadosLimpios.map((item, i) => `Resultado ${i+1}:\nTitulo: ${item.title}\nContenido: ${item.content}\nURL: ${item.url}`).join("\n\n");

        // CEREBRO ESTRATEGA (Doble Candado)
        const promptGroq = idioma === 'es' 
        ? `Eres un Estratega de Clipping Experto. Analiza estos resultados sobre "${categoria}".
        REGLAS ABSOLUTAS (SI FALLAS AQUÍ, ESTÁS DESPEDIDO):
        1. CERO ARTÍCULOS: Si el resultado es un blog, una noticia, o un texto escrito sin video/audio, BÓRRALO. NO LO INCLUYAS EN EL JSON.
        2. DOBLE CANDADO A INSTAGRAM: Si el URL contiene "instagram", DESTRÚYELO.
        3. FORMATO ÚNICO: Solo se permite "Video Largo" (YouTube/Rumble/Odysee) o "Podcast/Audio".
        4. DESCRIPCIÓN: Explica de qué trata el video/audio (2 líneas).
        5. POTENCIAL VIRAL: Por qué este video ganará atención (1 línea).
        6. GANCHO: Di qué minuto clippear.
        Devuelve ÚNICAMENTE un JSON array con máximo 5 resultados EXACTAMENTE con esta estructura:
        {"nombre": "Título", "tipo_contenido": "Video Largo" o "Podcast/Audio", "descripcion": "De qué va...", "potencial_viralidad": "Por qué ganará...", "gancho": "Qué hacer...", "url": "enlace"}
        Datos: ${materiaPrima}`
        : `You are an Expert Clipping Strategist. Analyze these results about "${categoria}".
        ABSOLUTE RULES (IF YOU FAIL HERE, YOU ARE FIRED):
        1. ZERO ARTICLES: If the result is a blog, news, or written text without video/audio, DELETE IT. DO NOT INCLUDE IT IN THE JSON.
        2. DOUBLE LOCK ON INSTAGRAM: If the URL contains "instagram", DESTROY IT.
        3. ONLY FORMAT ALLOWED: "Long Video" (YouTube/Rumble/Odysee) or "Podcast/Audio".
        4. DESCRIPTION: Explain what the video/audio is about (2 lines).
        5. VIRAL POTENTIAL: Why this video will gain attention (1 line).
        6. HOOK: Say what minute to clip.
        Return ONLY a JSON array with max 5 results EXACTLY with this structure:
        {"nombre": "Title", "tipo_contenido": "Long Video" or "Podcast/Audio", "descripcion": "What it's about...", "potencial_viralidad": "Why it will win...", "gancho": "What to do...", "url": "link"}
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

            // TERCER CANDADO: Filtrado físico final en el servidor antes de enviar a la página
            const filtroFinal = seriesAnalizadas.filter(item => {
                const url = item.url.toLowerCase();
                if (url.includes('instagram') || url.includes('tiktok') || url.includes('facebook')) return false;
                // Rechazar artículos que la IA haya dejado pasar por error
                if (item.tipo_contenido && (item.tipo_contenido.toLowerCase().includes('artíc') || item.tipo_contenido.toLowerCase().includes('news'))) return false;
                return true;
            });

            return res.status(200).json({ series: filtroFinal });

        } catch (parseError) {
            return res.status(200).json({ series: respaldoSeguro });
        }

    } catch (error) {
        console.error("Error general en clipping:", error);
        return res.status(500).json({ error: "Error analizando contenido: " + error.message });
    }
}
