import dynamic from 'next/dynamic'
import Link from 'next/link'

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
  return (
    <>
      {/* Floating Navigation Button */}
      <Link href="/space">
        <button className="fixed top-6 right-6 z-50 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
          🌐 3D Space
        </button>
      </Link>
      <WorldExplorer />
    </>
  )
}
