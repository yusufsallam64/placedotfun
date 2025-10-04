import dynamic from 'next/dynamic'

// Dynamically import WorldExplorer with no SSR to avoid Three.js server-side issues
const WorldExplorer = dynamic(() => import('@/components/WorldExplorer'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#fff',
        fontSize: '24px',
      }}
    >
      Loading World...
    </div>
  ),
})

export default function Home() {
  return <WorldExplorer />
}
