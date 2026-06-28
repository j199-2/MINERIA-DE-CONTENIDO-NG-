export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { categoria, nicho, idioma } = req.body;
    const apiKey = process.env.TAVILY_API_KEY;

    if (!apiKey) return res.status(500).json({ error: "Falta la TAVILY_API_KEY en Vercel" });

    const idiomaCompleto = idioma === 'es' ? 'ESPAÑOL' : 'INGLÉS';

    // Lógica de búsqueda para asegurar que encuentre contenido de calidad
    let query = "";
    if (nicho === 'dramas') {
        query = `mini series verticales "${categoria}" gratis en ${idiomaCompleto} youtube o dailymotion`;
    } else {
        query = `vídeos largos de "${categoria}" en ${idiomaCompleto} youtube`;
    }

    try {
        // EL RADAR: Búsqueda en internet en tiempo real
        const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                query: query,
                search_depth: "basic", // Rápido y gratuito
                max_results: 5 // Trae 5 resultados reales
            })
        });

        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            return res.status(200).json({ series: [] }); // Si no hay resultados, devuelve lista vacía
        }

        // MAPEO: Convertimos lo que encontró Tavily al formato exacto que espera tu página
        const series = data.results.map(item => {
            // Los datos de Tavily no tienen "capítulos" ni "duración", se los inventamos de forma inteligente
            const isVertical = item.title.toLowerCase().includes('vertical') || nicho === 'dramas';
            
            if (isVertical) {
                return { nombre: item.title, genero: categoria, capitulos: "5+", viralidad: "Alta", url: item.url };
            } else {
                return { nombre: item.title, tipo: "Video/Podcast", duracion: "+15 mins", viralidad: "Materia Prima", url: item.url };
            }
        });

        return res.status(200).json({ series });

    } catch (error) {
        console.error("Error con Tavily:", error);
        return res.status(500).json({ error: "Error de búsqueda: " + error.message });
    }
}
