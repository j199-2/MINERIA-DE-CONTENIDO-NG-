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
        // Inicialización básica y limpia sin configuraciones raras que rompan la API
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // Estructura de datos dinámica según el nicho seleccionado
        let estructuraEjemplo = "";
        if (nicho === "dramas") {
            estructuraEjemplo = `{ "nombre": "Título", "genero": "Estilo", "capitulos": 10, "viralidad": "95%", "url": "https://youtube.com" }`;
        } else {
            estructuraEjemplo = `{ "nombre": "Título", "tipo": "Video/Podcast", "duracion": "15:00 min", "viralidad": "95%", "url": "https://youtube.com" }`;
        }

        // Prompt ultra-estricto para obligar a la IA a dar solo JSON limpio
        const prompt = `Actúa como un experto en minería de contenidos y clipping viral para redes sociales. 
        Genera una lista de 3 ideas de contenido viral en tiempo real para el nicho "${nicho}" y la categoría "${categoria}".
        
        Devuelve ÚNICAMENTE un objeto JSON válido. No incluyas introducciones, ni explicaciones, ni saludos, ni marcas de formato markdown como \`\`\`json.
        
        La estructura del JSON debe ser exactamente esta en idioma "${idioma || 'es'}":
        {
          "series": [
            ${estructuraEjemplo}
          ]
        }`;

        const result = await model.generateContent(prompt);
        let textResponse = result.response.text().trim();

        // Limpieza de seguridad por si la IA ignora las reglas y mete bloques de markdown (```json ... ```)
        if (textResponse.includes("```")) {
            textResponse = textResponse.replace(/```json/gi, "").replace(/```/gi, "").trim();
        }

        // Intentar parsear el JSON generado en tiempo real
        try {
            const respuestaIA = JSON.parse(textResponse);
            return res.status(200).json(respuestaIA);
        } catch (parseError) {
            console.error("Error parseando el texto de Gemini:", textResponse);
            return res.status(500).json({ 
                error: "La IA respondió, pero el formato de texto no se pudo transformar a JSON correctamente." 
            });
        }

    } catch (error) {
        console.error("Error en el backend con Gemini:", error);
        return res.status(500).json({ 
            error: `Error de la IA en tiempo real: ${error.message || "No se pudo procesar la solicitud"}` 
        });
    }
}
