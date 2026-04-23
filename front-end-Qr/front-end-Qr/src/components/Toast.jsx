export default function Toast({ message, color, visible }) {
  return (
    <div
      className={`fixed bottom-10 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl shadow-lg text-lg font-semibold z-50 text-white transition-all duration-300 ${
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
      }`}
      style={{ backgroundColor: color }}
    >
      {message}
    </div>
  );
}