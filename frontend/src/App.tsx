import { useEffect, useRef, useState } from 'react';

function App() {
  const [estado, setEstado] = useState('Conectando al motor C++...');
  const [tamañoRecibido, setTamañoRecibido] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Conectar al WebSocket del backend C++
    // window.location.host = el mismo servidor que nos sirvió la página
    const ws = new WebSocket(`ws://${window.location.host}/ws`);
    ws.binaryType = 'arraybuffer'; // Queremos recibir datos binarios

    ws.onopen = () => {
      setEstado('✅ Conectado al motor C++. Enviando datos de prueba...');
      
      // Enviar 1 MB de datos de prueba al C++
      const buffer = new ArrayBuffer(1024 * 1024);
      const vista = new Uint8Array(buffer);
      for (let i = 0; i < vista.length; i++) {
        vista[i] = i % 256;
      }
      ws.send(buffer);
      setEstado('📤 Datos enviados. Esperando procesamiento...');
    };

    ws.onmessage = (evento) => {
      if (evento.data instanceof ArrayBuffer) {
        const vista = new Uint8Array(evento.data);
        setTamañoRecibido(vista.length);
        setEstado(`✅ Datos procesados y devueltos por C++. ¡Tamaño: ${vista.length} bytes!`);
        console.log('Primeros 10 bytes procesados:', vista.slice(0, 10));
      } else {
        setEstado(`💬 Mensaje del motor: ${evento.data}`);
      }
    };

    ws.onerror = (error) => {
      setEstado('❌ Error de conexión');
      console.error(error);
    };

    wsRef.current = ws;

    return () => ws.close();
  }, []);

  return (
    <div style={{ padding: '30px', fontFamily: 'Segoe UI, Arial', textAlign: 'center' }}>
      <h1>🚀 App Híbrida: React + C++ en Docker</h1>
      <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '10px' }}>
        <p style={{ fontSize: '1.2rem' }}>{estado}</p>
        {tamañoRecibido > 0 && (
          <p style={{ color: '#28a745', fontWeight: 'bold' }}>
            📊 Datos procesados: {tamañoRecibido} bytes
          </p>
        )}
      </div>
    </div>
  );
}

export default App;