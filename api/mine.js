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
    // ANTI-CACHÉ: Inyectamos el día actual para obligar a Tavily a buscar en vivo
    // ==========================================
    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const diaActual = idioma === 'es' ? diasSemana[new Date().getDay()] : daysOfWeek[new Date().getDay()];

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
    // NIVEL 2: CLIPPING (Anti-Caché + Guardia de Lista Blanca)
    // ==========================================================================================
    let queryTavily = "";
    
    // Metemos el "diaActual" al final. Tavily nunca ha visto esta búsqueda hoy, así que no puede usar caché.
    if (nicho === 'salud') {
        queryTavily = `${categoria} ${tiempo} (youtube OR rumble OR odysee OR podcast) ${idiomaCompleto} ${diaActual}`;
    } else if (nicho === 'motivacion') {
        queryTavily = `${categoria} ${tiempo} (youtube OR rumble OR odysee OR podcast) ${idiomaCompleto} ${diaActual}`;
    } else if (nicho === 'religion') {
        queryTavily = `${categoria} ${tiempo} (youtube OR rumble OR odysee OR podcast OR sermon) ${idiomaCompleto} ${diaActual}`;
    }

    try {
        const tavilyResponse = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tavilyKey}` },
            body: JSON.stringify({ 
                query: queryTavily, 
                search_depth: "advanced", 
                max_results: 15, // Pedimos más porque el guardia va a tirar muchos
                time_range: "week"
            })
        });

        const tavilyData = await tavilyResponse.json();
        if (!tavilyData.results || tavilyData.results.length === 0) {
            return res.status(200).json({ series: [] });
        }

        // ====================================================================
        // EL GUARDIA DE SEGURIDAD (LISTA BLANCA ESTRICTA)
        // Si no es de estas 5 plataformas, NO PASA. Ni blogs, ni instagram, ni noticias.
        // ====================================================================
        const listaBlanca = ['youtube.com', 'rumble.com', 'odysee.com', 'spotify.com', 'vimeo.com'];
        
        const resultadosLimpios = tavilyData.results.filter(item => {
            const url = item.url.toLowerCase();
            // Revisa si la URL contiene ALGUNO de los dominios de la lista blanca
            return listaBlanca.some(dominioPermitido => url.includes(dominioPermitido));
        });

        // Si después del filtro no sobrevivió nada, devolvemos vacío
        if (resultadosLimpios.length === 0) {
            return res.status(200).json({ series: [] });
        }

        // Mapeamos los que sí pasaron el guardia
        const respaldoSeguro = resultadosLimpios.map(item => ({
            nombre: item.title,
            tipo_contenido: "Video Largo",
            descripcion: "Material premium encontrado.",
            potencial_viralidad: "Alto (Fuente verificada)",
            gancho: "Revisa el contenido para encontrar el ángulo.",
            url: item.url
        }));

        const materiaPrima = resultadosLimpios.map((item, i) => `Resultado ${i+1}:\nTitulo: ${item.title}\nContenido: ${item.content}\nURL: ${item.url}`).join("\n\n");

        // CEREBRO ESTRATEGA (Ahora solo analiza contenido 100% limpio)
        const promptGroq = idioma === 'es' 
        ? `Eres un Estratega de Clipping Experto. Analiza estos resultados (ya filtrados, son 100% video/podcast de YouTube, Rumble, Odysee, Spotify o Vimeo) sobre "${categoria}".
        REGLAS:
        1. FORMATO: Identifica si es "Video Largo" o "Podcast/Audio".
        2. DESCRIPCIÓN: Explica de qué trata (2 líneas).
        3. POTENCIAL VIRAL: Por qué este video ganará atención (1 línea).
        4. GANCHO: Di qué minuto clippear o qué fragmento resumir.
        Devuelve ÚNICAMENTE un JSON array con máximo 5 resultados EXACTAMENTE con esta estructura:
        {"nombre": "Título", "tipo_contenido": "Video Largo" o "Podcast/Audio", "descripcion": "De qué va...", "potencial_viralidad": "Por qué ganará...", "gancho": "Qué hacer...", "url": "enlace"}
        Datos: ${materiaPrima}`
        : `You are an Expert Clipping Strategist. Analyze these results (already filtered, 100% video/podcast from YouTube, Rumble, Odysee, Spotify or Vimeo) about "${categoria}".
        RULES:
        1. FORMAT: Identify if it's "Long Video" or "Podcast/Audio".
        2. DESCRIPTION: Explain what it's about (2 lines).
        3. VIRAL POTENTIAL: Why this video will gain attention (1 line).
        4. HOOK: Say what minute to clip or what fragment to summarize.
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
        } catch (parseError) {
            return res.status(200).json({ series: respaldoSeguro });
        }

        return res.status(200).json({ series: seriesAnalizadas });

    } catch (error) {
        console.error("Error general en clipping:", error);
        return res.status(500).json({ error: "Error analizando contenido: " + error.message });
    }
}
