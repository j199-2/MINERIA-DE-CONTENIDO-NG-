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
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: promptSistema }] }],
            generationConfig: { temperature: 0.7 }
        })
    });

    const data = await response.json();
    const textoIA = data.candidates[0].content.parts[0].text;
    const textoLimpio = textoIA.replace(/```json/g, '').replace(/```/g, '').trim();
    const series = JSON.parse(textoLimpio);

    return res.status(200).json({ series: series });

} catch (error) {
    console.error("Error con Gemini:", error);
    return res.status(500).json({ error: "La IA no pudo procesar la solicitud" });
}
