export default function OrderFilter({ selected, onChange }) {
  return (
    <div className="flex gap-2 mb-4">
      <button
        className={`px-3 py-1 rounded ${selected === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        onClick={() => onChange('all')}
      >
        All Orders
      </button>
      <button
        className={`px-3 py-1 rounded ${selected === 'node1' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        onClick={() => onChange('node1')}
      >
        Node 1 (2025+)
      </button>
      <button
        className={`px-3 py-1 rounded ${selected === 'node2' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        onClick={() => onChange('node2')}
      >
        Node 2 (2024-)
      </button>
    </div>
  );
}
