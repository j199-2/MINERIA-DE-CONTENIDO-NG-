export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { categoria, nicho, idioma } = req.body;
    const apiKey = process.env.TAVILY_API_KEY;

    if (!apiKey) return res.status(500).json({ error: "Falta la TAVILY_API_KEY en Vercel" });

    const idiomaCompleto = idioma === 'es' ? 'ESPAÑOL' : 'INGLÉS';

    // ANTENAS CALIBRADAS: Traducimos lo que busca la gente común a lenguaje de buscador web
    let query = "";
    if (nicho === 'dramas') {
        query = `playlist "mini serie corta" "${categoria}" vertical gratis ${idiomaCompleto} site:youtube.com OR site:dailymotion.com`;
    } else {
        query = `top trending "${categoria}" ${idiomaCompleto} site:youtube.com`;
    }

    try {
        const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                query: query,
                search_depth: "advanced", // RADAR MEJORADO: Búsqueda profunda
                max_results: 5 
            })
        });

        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            return res.status(200).json({ series: [] }); 
        }

        const series = data.results.map(item => {
            const isVertical = nicho === 'dramas' || item.title.toLowerCase().includes('vertical');
            
            if (isVertical) {
                return { nombre: item.title, genero: categoria, capitulos: "5+", viralidad: "Alta", url: item.url };
            } else {
                return { nombre: item.title, tipo: "Video/Podcast", duracion: "+15 mins", viralidad: "Materia Prima", url: item.url };
            }
        });

        return res.status(200).json({ series: series });

    } catch (error) {
        console.error("Error con Tavily:", error);
        return res.status(500).json({ error: "Error de búsqueda: " + error.message });
    }
}
