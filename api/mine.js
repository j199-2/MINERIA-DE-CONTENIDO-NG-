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
    // NIVEL 1: DRAMAS (Mantiene su propio radar rápido)
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
    // NIVEL 2: CLIPPING (EL RADAR DE FRANCOTIRADOR - Busca solo en las Bóvedas)
    // ==========================================================================================
    let queryTavily = "";
    
    // LEY ESTRICTA: Usamos el comando "site:" para obligar al buscador a mirar DENTRO de estas plataformas exclusivas
    if (nicho === 'salud') {
        queryTavily = `"${categoria}" ${tiempo} (site:open.spotify.com OR site:rumble.com OR site:substack.com OR site:ted.com OR site:vimeo.com) ${idiomaCompleto} -tiktok -reels -shorts -instagram`;
    } else if (nicho === 'motivacion') {
        queryTavily = `"${categoria}" ${tiempo} (site:linkedin.com OR site:open.spotify.com OR site:rumble.com OR site:tedx.com OR site:audible.com) ${idiomaCompleto} -tiktok -reels -shorts -instagram`;
    } else if (nicho === 'religion') {
        queryTavily = `"${categoria}" ${tiempo} (site:vimeo.com OR site:sermonaudio.com OR site:open.spotify.com OR site:audible.com OR site:rumble.com) ${idiomaCompleto} -tiktok -reels -shorts -instagram`;
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
            tipo_contenido: "Contenido Premium",
            descripcion: "Materia prima de alta calidad encontrada. Revisa el enlace.",
            potencial_viralidad: "Alto (Fuente verificada)",
            gancho: "Revisa el contenido para encontrar el ángulo de clipping.",
            url: item.url
        }));

        const materiaPrima = tavilyData.results.map((item, i) => `Resultado ${i+1}:\nTitulo: ${item.title}\nContenido: ${item.content}\nURL: ${item.url}`).join("\n\n");

        // CEREBRO ESTRATEGA: Ahora sabe de dónde viene el contenido y cómo analizarlo
        const promptGroq = idioma === 'es' 
        ? `Eres un Estratega de Clipping Experto. Estamos extrayendo contenido de plataformas premium (Spotify, Rumble, Substack, TED, Vimeo, Audible, LinkedIn).
        REGLAS ESTRICTAS:
        1. FORMATO: Identifica si es "Podcast/Audio" (Spotify/Audible), "Artículo/Análisis" (Substack/LinkedIn) o "Video Conferencia/Documental" (Rumble/TED/Vimeo).
        2. DESCARTA cualquier resultado corto o basura.
        3. ANÁLISIS ESPECÍFICO:
           - Si es Podcast/Audio: Di qué minuto tiene el "Gancho Hablado" explosivo.
           - Si es Artículo: Di cómo convertir ese texto en un video "Faceless" (sin cara) de alta retención.
           - Si es Video: Di qué fragmento recortar.
        4. POTENCIAL VIRAL: Explica por qué este material de fuente premium aplastará a la competencia.
        Devuelve ÚNICAMENTE un JSON array con máximo 5 resultados EXACTAMENTE con esta estructura:
        {"nombre": "Título", "tipo_contenido": "Ej: Podcast/Audio", "descripcion": "De qué va...", "potencial_viralidad": "Por qué ganará...", "gancho": "Estrategia de clipping...", "url": "enlace"}
        Datos: ${materiaPrima}`
        : `You are an Expert Clipping Strategist. We are extracting content from premium platforms (Spotify, Rumble, Substack, TED, Vimeo, Audible, LinkedIn).
        STRICT RULES:
        1. FORMAT: Identify if it's "Podcast/Audio", "Article/Analysis", or "Video Talk/Doc".
        2. DISCARD any short or trash results.
        3. SPECIFIC ANALYSIS:
           - If Podcast/Audio: What exact minute has the explosive "Spoken Hook"?
           - If Article: How to turn this text into a high-retention "Faceless" video?
           - If Video: What exact fragment to clip?
        4. VIRAL POTENTIAL: Explain why this premium material will crush the competition.
        Return ONLY a JSON array with max 5 results EXACTLY with this structure:
        {"nombre": "Title", "tipo_contenido": "Eg: Podcast/Audio", "descripcion": "What it's about...", "potencial_viralidad": "Why it will win...", "gancho": "Clipping strategy...", "url": "link"}
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
