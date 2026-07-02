export default function Placeholder({ title, phase, children }: { title: string; phase: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">{title}</h1>
      <p className="text-sm text-gray-500 mb-8">Væntanlegt — kemur með {phase}</p>
      <div className="max-w-2xl bg-white border border-gray-200 rounded-xl p-6">
        <div className="text-sm text-gray-600 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
