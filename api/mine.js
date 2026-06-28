import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { categoria, nicho, idioma } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) return res.status(500).json({ error: "Falta la GEMINI_API_KEY en Vercel" });

    const idiomaCompleto = idioma === 'es' ? 'ESPAÑOL' : 'INGLÉS';
    let promptSistema = "";

    if (nicho === 'dramas') {
        promptSistema = `Eres un buscador experto en mini series cortas en formato vertical (9:16). Busca series que cumplan: 1. 5+ episodios. 2. 100% GRATIS en páginas WEB. 3. Categoría: ${categoria}. Responde SOLO con array JSON: [{"nombre": "Titulo", "genero": "${categoria}", "capitulos": 10, "viralidad": "Alta", "url": "https://..."}]`;
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
        // INICIALIZACIÓN CON EL SDK OFICIAL FORZANDO RUTA V1
        const genAI = new GoogleGenerativeAI(apiKey, {
            httpOptions: { baseUrl: 'https://generativelanguage.googleapis.com/v1' }
        });
        
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: { 
                responseMimeType: "application/json", 
                temperature: 0.3 
            }
        });

        const result = await model.generateContent(promptSistema);
        const textoLimpio = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const series = JSON.parse(textoLimpio);

        return res.status(200).json({ series: series });

    } catch (error) {
        console.error("Error con Gemini:", error);
        return res.status(500).json({ error: "Error procesando la solicitud: " + error.message });
    }
}
