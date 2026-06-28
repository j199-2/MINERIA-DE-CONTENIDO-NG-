export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { categoria, nicho, idioma } = req.body;
    const apiKey = process.env.GEMINI_API_KEY; 

    if (!apiKey) return res.status(500).json({ error: "Falta la GEMINI_API_KEY en Vercel" });

    const idiomaCompleto = idioma === 'es' ? 'ESPAÑOL' : 'INGLÉS';
    const reglaUrl = `5. REGLA DE ORO CONTRA INVENCIÓN: Si no estás 100% seguro de que el enlace URL es real y verificable, NO LO INVENTES. Escribe exactamente "SIN_URL" en el campo "url". NUNCA pongas enlaces inventados.`;

    let promptSistema = "";

    if (nicho === 'dramas') {
        promptSistema = `Eres un buscador experto en mini series cortas en formato vertical (9:16). Busca series que cumplan: 1. 5+ episodios. 2. 100% GRATIS en páginas WEB. 3. Categoría: ${categoria}. ${reglaUrl} Responde SOLO con array JSON: [{"nombre": "Titulo", "genero": "${categoria}", "capitulos": 10, "viralidad": "Alta", "url": "https://... o SIN_URL"}]`;
    } else if (nicho === 'salud') {
        promptSistema = `Eres un experto Content Miner en Salud. Busca MATERIAL LARGO sobre: ${categoria}. REGLAS: 1. IDIOMA ESTRICTO: ${idiomaCompleto}. 2. FORMATO LARGO: Videos >15 mins, Podcasts, Estudios. 3. DATOS: "tipo", "duracion" (Ej: 45 mins), "viralidad". ${reglaUrl} JSON: [{"nombre": "Título", "tipo": "Video Largo", "duracion": "45 mins", "viralidad": "Potencial Alto", "url": "https://... o SIN_URL"}]`;
    } else if (nicho === 'motivacion') {
        promptSistema = `Eres un experto Content Miner en Motivación. Busca MATERIAL LARGO sobre: ${categoria}. REGLAS: 1. IDIOMA ESTRICTO: ${idiomaCompleto}. 2. FORMATO LARGO: Conferencias, Podcasts >15 mins. 3. DATOS: "tipo", "duracion", "viralidad". ${reglaUrl} JSON: [{"nombre": "Título", "tipo": "Podcast", "duracion": "1 hora", "viralidad": "Materia Prima", "url": "https://... o SIN_URL"}]`;
    } else if (nicho === 'religion') {
        promptSistema = `Eres un experto Content Miner en contenido Religioso. Busca MATERIAL LARGO sobre: ${categoria}. REGLAS: 1. IDIOMA ESTRICTO: ${idiomaCompleto}. 2. FORMATO LARGO: Predicas, Estudios >15 mins. 3. DATOS: "tipo", "duracion", "viralidad". ${reglaUrl} JSON: [{"nombre": "Título", "tipo": "Predica", "duracion": "40 mins", "viralidad": "Excelente", "url": "https://... o SIN_URL"}]`;
    } else {
        return res.status(400).json({ error: "Nicho no soportado" });
    }

    try {
        // CAMBIO AQUÍ: Usamos -latest para evitar errores de Google
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptSistema }] }],
                generationConfig: { temperature: 0.3 } 
            })
        });

        const responseText = await response.text();

        try {
            const data = JSON.parse(responseText);
            
            if (data.error) {
                throw new Error("Error de Gemini: " + data.error.message);
            }

            const textoIA = data.candidates[0].content.parts[0].text;
            const textoLimpio = textoIA.replace(/```json/g, '').replace(/```/g, '').trim();
            const series = JSON.parse(textoLimpio);
            return res.status(200).json({ series: series });

        } catch (parseError) {
            throw new Error("Gemini no envió JSON. Respondió esto: " + responseText.substring(0, 300));
        }

    } catch (error) {
        console.error("Error con Gemini:", error);
        return res.status(500).json({ error: error.message });
    }
}
