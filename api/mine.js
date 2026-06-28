import { GoogleGenAI } from '@google/genai';

// Base de datos de respaldo por si el servidor llega a saturarse
const baseDeDatosContenido = {
    dramas: [
        { nombre: "El Heredero Despiadado", genero: "Romance CEO", capitulos: 12, viralidad: "98%", url: "https://youtube.com" },
        { nombre: "Mi Segunda Vida como Billonario", genero: "Venganza", capitulos: 8, viralidad: "94%", url: "https://tiktok.com" },
        { nombre: "Lágrimas de Sangre", genero: "Mafia", capitulos: 24, viralidad: "99%", url: "https://youtube.com" }
    ],
    salud: [
        { nombre: "El secreto del Ayuno Intermitente", tipo: "Video Corto", duracion: "12:45 min", viralidad: "91%", url: "https://youtube.com" },
        { nombre: "Ciencia: ¿Por qué el azúcar destruye tus músculos?", tipo: "Podcast", duracion: "45:20 min", viralidad: "88%", url: "https://spotify.com" }
    ],
    motivacion: [
        { nombre: "Mentalidad Inquebrantable - Enfoque Alpha", tipo: "Discurso", duracion: "18:10 min", viralidad: "97%", url: "https://youtube.com" },
        { nombre: "Resumen Animado: Hábitos Atómicos", tipo: "Educativo", duracion: "22:00 min", viralidad: "93%", url: "https://youtube.com" }
    ],
    religion: [
        { nombre: "Estudio Profundo: El Apocalipsis Revelado", tipo: "Predicación", duracion: "35:12 min", viralidad: "86%", url: "https://youtube.com" },
        { nombre: "Salmo 91: La Oración de Protección Absoluta", tipo: "Reflexión Musical", duracion: "10:00 min", viralidad: "96%", url: "https://facebook.com" }
    ]
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { categoria, nicho, idioma } = req.body;

    // Verificar que la llave de Gemini esté en tus variables de Vercel
    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "Falta la GEMINI_API_KEY en Vercel" });
    }

    try {
        // Inicializar el cliente oficial con la llave de entorno
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        const prompt = `Actúa como un experto en minería de contenidos y clipping viral para redes sociales. 
        Genera una lista de 3 ideas de contenido de video largo o series virales para el nicho "${nicho}" y específicamente la categoría "${categoria}".
        Responde estrictamente en formato JSON válido. No agregues texto de introducción ni explicaciones.
        
        El formato de salida debe ser exactamente así en idioma "${idioma || 'es'}":
        {
          "series": [
            { "nombre": "Título llamativo", "genero": "Subcategoría o estilo", "capitulos": 10, "tipo": "Video/Podcast", "duracion": "15:00 min", "viralidad": "95%", "url": "https://youtube.com" }
          ]
        }`;

        // Llamada usando el modelo moderno optimizado y forzando respuesta JSON
        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json'
            }
        });

        // Parsear la respuesta estructurada recibida
        const respuestaIA = JSON.parse(response.text);
        return res.status(200).json(respuestaIA);

    } catch (error) {
        console.error("Error en el backend con Gemini:", error);
        
        // Si hay un fallo de cuotas o de red, devolvemos los datos locales para salvaguardar la experiencia de usuario
        const datosRespaldo = baseDeDatosContenido[nicho] || baseDeDatosContenido['dramas'];
        return res.status(200).json({ series: datosRespaldo });
    }
}
