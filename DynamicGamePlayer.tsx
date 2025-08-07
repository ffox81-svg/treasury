import React from 'react';
import { LightbulbIcon } from './icons';

interface DynamicGamePlayerProps {
  gameCode: string | null;
  isLoading: boolean;
}

const DynamicGamePlayer: React.FC<DynamicGamePlayerProps> = ({ gameCode, isLoading }) => {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] bg-gray-100 rounded-lg">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-gray-600 font-semibold">יוצר את המשחק שלך עם AI...</p>
        <p className="text-sm text-gray-500">זה עשוי לקחת רגע, תודה על הסבלנות!</p>
      </div>
    );
  }

  if (!gameCode) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] bg-gray-100 rounded-lg">
        <LightbulbIcon className="w-12 h-12 text-gray-400 mb-4" />
        <p className="text-gray-600">שגיאה ביצירת המשחק.</p>
        <p className="text-sm text-gray-500">נסה שוב או שנה את הפרומפט.</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-black rounded-lg shadow-lg overflow-hidden border">
        <iframe
            srcDoc={gameCode}
            title="Generated Game"
            sandbox="allow-scripts allow-same-origin"
            className="w-full h-[600px] border-0"
            scrolling="no"
        />
    </div>
  );
};

export default DynamicGamePlayer;
