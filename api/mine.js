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
        // 1. LA CONEXIÓN EXITOSA QUE ENCONTRÓ GEMINI
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, { apiVersion: 'v1' });
        
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: { response_mime_type: "application/json" }
        });

        // 2. ESTRUCTURA DEL PROMPT
        let estructuraEjemplo = "";
        if (nicho === "dramas") {
            estructuraEjemplo = `{ "nombre": "Título", "genero": "Estilo", "capitulos": 10, "viralidad": "95%", "url": "https://youtube.com" }`;
        } else {
            estructuraEjemplo = `{ "nombre": "Título", "tipo": "Video/Podcast", "duracion": "15:00 min", "viralidad": "95%", "url": "https://youtube.com" }`;
        }

        const prompt = `Actúa como un experto en minería de contenidos y clipping viral para redes sociales. 
        Genera una lista de 3 ideas de contenido viral para el nicho "${nicho}" y la categoría "${categoria}".
        Responde estrictamente en un formato JSON válido, sin textos extras ni introducciones.
        
        La estructura de cada objeto dentro de la lista de "series" debe ser exactamente así en idioma "${idioma || 'es'}:
        {
          "series": [
            ${estructuraEjemplo}
          ]
        }`;

        const result = await model.generateContent(prompt);
        const textResponse = result.response.text();

        // 3. LIMPIEZA
        const jsonLimpio = textResponse.replace(/```json/g, "").replace(/```/g, "").trim();
        
        // 4. MI SOLUCIÓN: Extraer el array de dentro del objeto que pidió Gemini
        const respuestaGemini = JSON.parse(jsonLimpio);
        const series = respuestaGemini.series || [];
        
        // 5. ENVIARLO EN EL FORMATO QUE ESPERA TU PÁGINA
        return res.status(200).json({ series: series });

    } catch (error) {
        console.error("Error en el backend con Gemini:", error);
        return res.status(500).json({ 
            error: `Error de la IA en tiempo real: ${error.message || "No se pudo procesar la solicitud"}` 
        });
    }
}
