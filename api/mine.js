**PASO 33 (Código completo actualizado a v1)**

**Nombre del archivo:** `mine.js` (dentro de la carpeta `api`).
**Acción:** En GitHub, abre `api/mine.js`, **BORRA TODO** lo que tiene y pega este código completo:

```javascript
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { categoria, nicho, idioma } = req.body;
    const apiKey = process.env.GEMINI_API_KEY; 

    if (!apiKey) return res.status(500).json({ error: "Falta la GEMINI_API_KEY en Vercel" });

    const idiomaCompleto = idioma === 'es' ? 'ESPAÑOL' : 'INGLÉS';
    
    let promptSistema = "";

    if (nicho === 'dramas') {
        promptSistema = `Eres un buscador experto. Busca series que cumplan: 1. 5+ episodios. 2. 100% GRATIS en páginas WEB. 3. Categoría: ${categoria}. Responde SOLO con array JSON: [{"nombre": "Titulo", "genero": "${categoria}", "capitulos": 10, "viralidad": "Alta", "url": "https://..."}]`;
    } else if (nicho === 'salud') {
        promptSistema = `Eres un experto Content Miner en Salud. Busca MATERIAL LARGO sobre: ${categoria}. REGLAS: 1. IDIOMA ESTRICTO: ${idiomaCompleto}. 2. FORMATO LARGO: Videos >15 mins, Podcasts, Estudios. 3. DATOS: "tipo", "duracion" (Ej: 45 mins), "viralidad". JSON: [{"nombre": "Título", "tipo": "Video Largo", "duracion": "45 mins", "viralidad": "Potencial Alto", "url": "https://..."}]`;
    } else if (nicho === 'motivacion') {
        promptSistema = `Eres un experto Content Miner en Motivación. Busca MATERIAL LARGO sobre: ${categoria}. REGLAS: 1. IDIOMA ESTRICTO: ${idiomaCompleto}. 2. FORMATO LARGO: Conferencias, Podcasts >15 mins. 3. DATOS: "tipo", "duracion", "viralidad". JSON: [{"nombre": "Título", "tipo": "Podcast", "duracion": "1 hora", "viralidad": "Materia Prima", "url": "https://..."}]`;
    } else if (nicho === 'religion') {
        promptSistema = `Eres un experto Content Miner en contenido Religioso. Busca MATERIAL LARGO sobre: ${categoria}. REGLAS: 1. IDIOMA ESTRICTO: ${idiomaCompleto}. 2. FORMATO LARGO: Predicas, Estudios >15 mins. 3. DATOS: "tipo", "duracion", "viralidad". JSON: [{"nombre": "Título", "tipo": "Predica", "duracion": "40 mins", "viralidad": "Excelente", "url": "https://..."}]`;
    } else {
        return res.status(400).json({ error: "Nicho no soportado" });
    }

    try {
        // RUTA OFICIAL V1 ACTUALIZADA DE GOOGLE
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptSistema }] }],
                // SÚPER PODER DE BÚSQUEDA EN TIEMPO REAL
                tools: [{"google_search_retrieval": {}}], 
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
```

Haz clic en **"Commit changes"** en GitHub, espera a que Vercel despliegue y dale a "Explorar".

**Espero tu indicación para el paso 34.**
