import React from 'react';
import { Link } from 'react-router-dom';
import { Home, Compass, BookOpen } from 'lucide-react';

export function NotFound() {
  return (
    <div className="max-w-2xl mx-auto my-12 md:my-20 p-8 md:p-12 text-center bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm animate-in fade-in zoom-in-95 duration-200">
      <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <Compass className="w-10 h-10" />
      </div>
      
      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tracking-wider uppercase bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1 rounded-full">
        Error 404
      </span>

      <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white mt-4 mb-3 tracking-tight">
        Página no encontrada
      </h1>

      <p className="text-base text-gray-600 dark:text-gray-300 max-w-md mx-auto mb-8 leading-relaxed">
        La ruta a la que intentas acceder no existe o ha sido movida. Puedes volver al inicio o continuar tu entrenamiento para el examen UdeA.
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          to="/"
          className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <Home className="w-4 h-4" />
          Volver al Inicio
        </Link>
        <Link
          to="/practice"
          className="w-full sm:w-auto px-6 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold rounded-xl transition-all flex items-center justify-center gap-2"
        >
          <BookOpen className="w-4 h-4" />
          Modo Práctica
        </Link>
      </div>
    </div>
  );
}
