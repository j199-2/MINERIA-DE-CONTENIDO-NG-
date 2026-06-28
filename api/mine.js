import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { categoria, nicho, idioma } = req.body;

    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "Falta la GEMINI_API_KEY en Vercel" });
    }

    try {
        // 1. SDK limpio apuntando a v1
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, { apiVersion: 'v1' });
        
        // 2. USAMOS GEMINI 1.5-PRO (Que sabemos que SÍ funciona)
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-pro",
            // 3. SINTAXIS CORRECTA DE GEMINI (snake_case, fuera de generationConfig)
            generationConfig: { 
                temperature: 0.3 
            },
            response_mime_type: "application/json" 
        });

        let estructuraEjemplo = "";
        if (nicho === "dramas") {
            estructuraEjemplo = `{ "nombre": "Título", "genero": "Estilo", "capitulos": 10, "viralidad": "95%", "url": "https://youtube.com" }`;
        } else {
            estructuraEjemplo = `{ "nombre": "Título", "tipo": "Video/Podcast", "duracion": "15:00 min", "viralidad": "95%", "url": "https://youtube.com" }`;
        }

        const prompt = `Actúa como un experto en minería de contenidos y clipping viral. 
        Genera 3 ideas de contenido viral para el nicho "${nicho}" y la categoría "${categoria}".
        Responde estrictamente en formato JSON válido, sin textos extras, en idioma "${idioma || 'es'}:
        { "series": [ ${estructuraEjemplo} ] }`;

        const result = await model.generateContent(prompt);
        const textResponse = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
        
        const respuestaGemini = JSON.parse(textResponse);
        return res.status(200).json({ series: respuestaGemini.series || [] });

    } catch (error) {
        console.error("Error en el backend:", error);
        return res.status(500).json({ 
            error: `Error de la IA: ${error.message}` 
        });
    }
}
