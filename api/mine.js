export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { categoria, nicho, idioma } = req.body;
    // CAMBIO 1: Ahora leemos la clave de Groq
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) return res.status(500).json({ error: "Falta la GROQ_API_KEY en Vercel" });

    const idiomaCompleto = idioma === 'es' ? 'ESPAÑOL' : 'INGLÉS';
    let promptSistema = "";

    if (nicho === 'dramas') {
        promptSistema = `Eres un buscador experto en mini series cortas en formato vertical (9:16). Busca series que cumplan: 1. 5+ episodios. 2. 100% GRATIS en páginas WEB (YouTube, Dailymotion). NUNCA Apps. 3. Categoría: ${categoria}. Responde SOLO con array JSON válido, sin texto extra: [{"nombre": "Titulo", "genero": "${categoria}", "capitulos": 10, "viralidad": "Alta", "url": "https://..."}]`;
    } else if (nicho === 'salud') {
        promptSistema = `Eres un experto Content Miner en Salud. Busca MATERIAL LARGO real sobre: ${categoria}. REGLAS: 1. IDIOMA ESTRICTO: ${idiomaCompleto}. 2. FORMATO LARGO: Videos YouTube >15 mins, Podcasts, Estudios. 3. REGLA DE ORO: Los enlaces DEBEN ser 100% reales, NO INVENTES URLs. 4. DATOS: "tipo" (Video Largo/Podcast/Estudio), "duracion" (Ej: 45 mins), "viralidad" (Potencial de Clipping). JSON: [{"nombre": "Título", "tipo": "Video Largo", "duracion": "45 mins", "viralidad": "Potencial Alto", "url": "https://..."}]`;
    } else if (nicho === 'motivacion') {
        promptSistema = `Eres un experto Content Miner en Motivación y Emprendimiento. Busca MATERIAL LARGO sobre: ${categoria}. REGLAS: 1. IDIOMA ESTRICTO: ${idiomaCompleto}. 2. FORMATO LARGO: Conferencias, Podcasts de negocios, Entrevistas >15 mins. 3. REGLA DE ORO: Los enlaces DEBEN ser 100% reales, NO INVENTES URLs. 4. DATOS: "tipo" (Conferencia/Podcast/Audiolibro), "duracion" (Ej: 1 hora), "viralidad" (Materia Prima para Reels). JSON: [{"nombre": "Título", "tipo": "Podcast", "duracion": "1 hora", "viralidad": "Materia Prima Excelente", "url": "https://..."}]`;
    } else if (nicho === 'religion') {
        promptSistema = `Eres un experto Content Miner en contenido Religioso/Cristiano. Busca MATERIAL LARGO sobre: ${categoria}. REGLAS: 1. IDIOMA ESTRICTO: ${idiomaCompleto}. 2. FORMATO LARGO: Predicas completas, Estudios bíblicos, Podcasts de fe >15 mins. 3. REGLA DE ORO: Los enlaces DEBEN ser 100% reales, NO INVENTES URLs. 4. DATOS: "tipo" (Predica/Estudio/Testimonio), "duracion" (Ej: 40 mins), "viralidad" (Excelente para Versículos). JSON: [{"nombre": "Título", "tipo": "Predica", "duracion": "40 mins", "viralidad": "Excelente para Versículos", "url": "https://..."}]`;
    } else {
        return res.status(400).json({ error: "Nicho no soportado" });
    }

    try {
        // CAMBIO 2: Nueva dirección de Groq y formato de seguridad
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}` // Groq usa "Bearer" antes de la clave
            },
            body: JSON.stringify({
                model: "llama-3.1-70b-versatile", // El modelo ultra rápido de Groq
                messages: [
                    { role: "system", content: "Eres un asistente que responde SOLO en formato JSON válido, sin usar bloques de código ```json." },
                    { role: "user", content: promptSistema }
                ],
                temperature: 0.7
            })
        });

        const data = await response.json();
        
        // CAMBIO 3: La forma de extraer el texto cambia en Groq
        const textoIA = data.choices[0].message.content;
        const textoLimpio = textoIA.replace(/```json/g, '').replace(/```/g, '').trim();
        const series = JSON.parse(textoLimpio);

        return res.status(200).json({ series: series });

    } catch (error) {
        console.error("Error con Groq:", error);
        return res.status(500).json({ error: "La IA no pudo procesar la solicitud" });
    }
}
