import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "FCFC '26",
        short_name: "FCFC '26",
        description: "FCFC'26 Tahmin Oyunu",
        start_url: '/',
        display: 'standalone',
        background_color: '#1A2621',
        theme_color: '#1A2621',
        icons: [
            {
                src: '/icon.png',
                sizes: 'any',
                type: 'image/png',
            },
        ],
    }
}
