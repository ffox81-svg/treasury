import React, { useState, useEffect, useMemo, useRef, useReducer } from 'react';
import toast from 'react-hot-toast';
import { UsersIcon, UserIcon, Gamepad2Icon, LightbulbIcon, FileTextIcon, CopyIcon, CheckCircleIcon, RefreshCwIcon, XIcon, MapPinIcon } from './icons';
import { GAME_TYPES, CHILDREN_EXAMPLES, ADULT_EXAMPLES } from '../constants';
import type { Audience, Game, GameExample } from '../types';
import { generateGamePrompt, generateGameCode } from '../services/geminiService';
import { getGames, addGame, deleteGame as deleteGameFromDb, saveGameToFirebase, updateGame, isFirebaseConfigPlaceholder, isHybridMode, isUsingFirebase, STORAGE_MODE } from '../services/firestoreService';
import DynamicGamePlayer from './DynamicGamePlayer';
import GameChatBox from './GameChatBox';
import { firebaseConfig } from '../firebaseConfig';

type State = {
  targetAudience: Audience | '';
  gameType: string;
  gameDescription: string;
  additionalFeatures: string;
  userExperience: string;
  technicalRequirements: string;
  isGenerating: boolean;
  generatedPrompt: string;
  copied: boolean;
  showExample: Audience | null;
  currentExampleIndex: { children: number; adults: number };
  isCreatingGame: boolean;
  gameCreated: boolean;
  unsavedGame: Game | null;
  createdGames: Game[];
  playingGame: Game | null;
  isLoadingGames: boolean;
  isGeneratingGameCode: boolean;
  isRegenerating: boolean;
  generatedGameCode: string | null;
};

type Action =
  | { type: 'SET_FIELD'; field: keyof State; payload: any }
  | { type: 'RESET_FORM' }
  | { type: 'START_GENERATING_PROMPT' }
  | { type: 'PROMPT_GENERATED'; payload: string }
  | { type: 'START_CREATING_GAME' }
  | { type: 'GAME_CREATED'; payload: Game }
  | { type: 'DISCARD_UNSAVED_GAME' }
  | { type: 'SAVE_GAME'; payload: Game }
  | { type: 'PLAY_GAME'; payload: Game }
  | { type: 'STOP_PLAYING' }
  | { type: 'DELETE_GAME'; payload: string }
  | { type: 'SET_GAMES'; payload: Game[] }
  | { type: 'SET_GENERATED_GAME_CODE'; payload: string | null };

const initialState: State = {
  targetAudience: '',
  gameType: '',
  gameDescription: '',
  additionalFeatures: '',
  userExperience: '',
  technicalRequirements: '',
  isGenerating: false,
  generatedPrompt: '',
  copied: false,
  showExample: null,
  currentExampleIndex: { children: 0, adults: 0 },
  isCreatingGame: false,
  gameCreated: false,
  unsavedGame: null,
  createdGames: [],
  playingGame: null,
  isLoadingGames: true,
  isGeneratingGameCode: false,
  isRegenerating: false,
  generatedGameCode: null,
};

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.payload };
    case 'RESET_FORM':
      return {
        ...state,
        targetAudience: '',
        gameType: '',
        gameDescription: '',
        additionalFeatures: '',
        userExperience: '',
        technicalRequirements: '',
        generatedPrompt: '',
        gameCreated: false,
        unsavedGame: null,
        isCreatingGame: false,
        isGenerating: false,
      };
    case 'START_GENERATING_PROMPT':
      return { ...state, isGenerating: true, generatedPrompt: '' };
    case 'PROMPT_GENERATED':
      return { ...state, isGenerating: false, generatedPrompt: action.payload };
    case 'START_CREATING_GAME':
      return { ...state, isCreatingGame: true, gameCreated: false };
    case 'GAME_CREATED':
      return {
        ...state,
        isCreatingGame: false,
        gameCreated: true,
        unsavedGame: action.payload,
        generatedPrompt: '',
      };
    case 'DISCARD_UNSAVED_GAME':
      return { ...state, unsavedGame: null, gameCreated: false };
    case 'SAVE_GAME':
      return {
        ...state,
        createdGames: [action.payload, ...state.createdGames],
        unsavedGame: null,
        gameCreated: false,
      };
    case 'PLAY_GAME':
      return { ...state, playingGame: action.payload, generatedGameCode: null };
    case 'STOP_PLAYING':
      return { ...state, playingGame: null, generatedGameCode: null, isGeneratingGameCode: false };
    case 'DELETE_GAME':
      return { ...state, createdGames: state.createdGames.filter(game => game.id !== action.payload) };
    case 'SET_GAMES':
      return { ...state, createdGames: action.payload, isLoadingGames: false };
    case 'SET_GENERATED_GAME_CODE':
      return { ...state, generatedGameCode: action.payload, isGeneratingGameCode: false };
    default:
      return state;
  }
};

const PromptGeneratorAgent: React.FC = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const {
    targetAudience,
    gameType,
    gameDescription,
    additionalFeatures,
    userExperience,
    technicalRequirements,
    isGenerating,
    generatedPrompt,
    copied,
    showExample,
    currentExampleIndex,
    isCreatingGame,
    gameCreated,
    unsavedGame,
    createdGames,
    playingGame,
    isLoadingGames,
    isGeneratingGameCode,
    isRegenerating,
    generatedGameCode,
  } = state;

  const galleryRef = useRef<HTMLDivElement>(null);
  const userId = 'anonymous_user'; // For saveGameToFirebase as requested
  const isFirebaseConfigured = !isFirebaseConfigPlaceholder;

  useEffect(() => {
    const fetchGames = async () => {
      dispatch({ type: 'SET_FIELD', field: 'isLoadingGames', payload: true });
      try {
        const gamesFromDb = await getGames();
        dispatch({ type: 'SET_GAMES', payload: gamesFromDb });
      } catch (error) {
        console.error("Error fetching games:", error);
        toast.error("לא ניתן לטעון משחקים שמורים.");
        dispatch({ type: 'SET_FIELD', field: 'isLoadingGames', payload: false });
      }
    };
    fetchGames();
  }, []);

  const refreshExample = (audience: Audience) => {
    dispatch({
      type: 'SET_FIELD',
      field: 'currentExampleIndex',
      payload: {
        ...currentExampleIndex,
        [audience]: (currentExampleIndex[audience] + 1) % (audience === 'children' ? CHILDREN_EXAMPLES.length : ADULT_EXAMPLES.length),
      },
    });
  };

  const getCurrentExample = (audience: Audience): GameExample => {
    const examples = audience === 'children' ? CHILDREN_EXAMPLES : ADULT_EXAMPLES;
    return examples[currentExampleIndex[audience]];
  };

  const generatePreviewPrompt = () => {
    if (!targetAudience || !gameType || !gameDescription.trim()) {
      return '';
    }
    const gameTypeHebrew = gameType === 'אחר' ? gameDescription.split('\n')[0] : gameType;
    if (targetAudience === 'children') {
      return `בואו ניצור ${gameTypeHebrew} מעניין! תארו לעצמכם ${gameDescription}.\n\nהמשחק שלנו יכלול:\n${additionalFeatures.split('\n').map(feature => feature.trim() ? `- ${feature}` : '').filter(Boolean).join('\n') || '- [תכונות יתווספו כאן...]'}\n\nנתחיל עם הגרסה הפשוטה ביותר ואחר כך נוסיף דברים מגניבים!\n\nאיך לדעתכם המשחק שלנו צריך להיראות?`;
    } else {
      return `אני רוצה ליצור ${gameTypeHebrew} שבו ${gameDescription}. ${userExperience ? `המטרה היא ליצור חוויה ${userExperience}.` : ''}\n\nהרכיבים המרכזיים שאני רוצה לראות:\n${additionalFeatures.split('\n').map(feature => feature.trim() ? `- ${feature}` : '').filter(Boolean).join('\n') || '- [תכונות יתווספו כאן...]'}\n\nדרישות טכניות:\n${technicalRequirements.split('\n').map(req => req.trim() ? `- ${req}` : '').filter(Boolean).join('\n') || '- [דרישות יתווספו כאן...]'}\n\nתתחיל עם הגרסה הבסיסית ביותר שעדיין מעניינת לשחק.`;
    }
  };

  const handleGeneratePrompt = async () => {
    if (!isFormValid) return;

    dispatch({ type: 'START_GENERATING_PROMPT' });

    try {
      const prompt = await generateGamePrompt({
        audience: targetAudience as Audience,
        gameType,
        gameDescription,
        additionalFeatures,
        userExperience,
        technicalRequirements
      });
      dispatch({ type: 'PROMPT_GENERATED', payload: prompt });
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('An unknown error occurred while generating the prompt.');
      }
      dispatch({ type: 'SET_FIELD', field: 'isGenerating', payload: false });
    }
  };

  const createGameFromPrompt = async () => {
    if (!generatedPrompt) {
      toast.error('אנא צור פרומפט תחילה');
      return;
    }

    dispatch({ type: 'START_CREATING_GAME' });
    toast.loading('יוצר קוד למשחק... זה עשוי לקחת רגע.', { id: 'creating-game' });

    try {
      const code = await generateGameCode(generatedPrompt);

      const gameTitle = gameType === 'אחר'
        ? gameDescription.split('\n')[0]
        : gameType;

      const newGameData: Omit<Game, 'id' | 'createdAt'> = {
        title: gameTitle,
        description: gameDescription,
        prompt: generatedPrompt,
        audience: targetAudience as Audience,
        gameType: gameType,
        code: code,
      };

      const tempGame: Game = {
        ...newGameData,
        id: `temp-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };

      dispatch({ type: 'GAME_CREATED', payload: tempGame });
      toast.success('המשחק נוצר! כעת תוכל לשמור אותו.', { id: 'creating-game' });

    } catch (error) {
        console.error("Error creating game:", error);
        const message = error instanceof Error ? error.message : "נכשל ביצירת המשחק.";
        toast.error(message, { id: 'creating-game' });
        dispatch({ type: 'SET_FIELD', field: 'isCreatingGame', payload: false });
    }
  };

  const handleSaveGame = async () => {
    if (!unsavedGame) return;

    const gameDataToSave: Omit<Game, 'id' | 'createdAt'> = {
      title: unsavedGame.title,
      description: unsavedGame.description,
      prompt: unsavedGame.prompt,
      audience: unsavedGame.audience,
      gameType: unsavedGame.gameType,
      code: unsavedGame.code,
    };

    const toastId = toast.loading(
      STORAGE_MODE === 'firebase' ? 'שומר בענן...' : 'שומר מקומית...'
    );

    try {
      const newGame = await addGame(gameDataToSave);
      dispatch({ type: 'SAVE_GAME', payload: newGame });

      const message = STORAGE_MODE === 'firebase'
        ? 'המשחק נשמר בענן! ☁️'
        : STORAGE_MODE === 'hybrid'
        ? 'המשחק נשמר מקומית! תוכל לסנכרן לענן בכל עת.'
        : 'המשחק נשמר מקומית! 💾';

      toast.success(message, { id: toastId });

      resetForm();

    } catch (error) {
      console.error("Error saving game:", error);
      toast.error("נכשלה שמירת המשחק.", { id: toastId });
    }
  };

  const handleDiscardUnsavedGame = () => {
    dispatch({ type: 'DISCARD_UNSAVED_GAME' });
    resetForm();
    toast('המשחק לא נשמר.', { icon: '🗑️' });
  };


  const playGame = async (game: Game) => {
    dispatch({ type: 'PLAY_GAME', payload: game });

    if (game.code && game.code.trim() !== '') {
      dispatch({ type: 'SET_GENERATED_GAME_CODE', payload: game.code });
    } else {
      dispatch({ type: 'SET_FIELD', field: 'isGeneratingGameCode', payload: true });
      try {
        toast.loading('...יוצר קוד למשחק בפעם הראשונה', { id: 'generating-code' });
        const code = await generateGameCode(game.prompt);
        await updateGame(game.id, code);

        dispatch({
          type: 'SET_FIELD',
          field: 'createdGames',
          payload: createdGames.map(g => (g.id === game.id ? { ...g, code } : g)),
        });
        dispatch({ type: 'SET_GENERATED_GAME_CODE', payload: code });
        toast.success('המשחק מוכן!', { id: 'generating-code' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'שגיאה לא ידועה אירעה בעת יצירת המשחק.';
        toast.error(message, { id: 'generating-code' });
        dispatch({ type: 'SET_GENERATED_GAME_CODE', payload: null });
      }
    }
  };

  const stopPlaying = () => {
    dispatch({ type: 'STOP_PLAYING' });
  };

  const copyGamePrompt = (prompt: string) => {
    navigator.clipboard.writeText(prompt);
    toast.success('פרומפט המשחק הועתק!');
  };

  const deleteGame = async (id: string, storageLocation?: 'local' | 'firebase') => {
    if (window.confirm('האם אתה בטוח שאתה רוצה למחוק את המשחק הזה?')) {
      try {
        await deleteGameFromDb(id);
        dispatch({ type: 'DELETE_GAME', payload: id });
        toast.success('המשחק נמחק.');
      } catch (error) {
        console.error("Error deleting game:", error);
        toast.error("נכשל במחיקת המשחק.");
      }
    }
  };

  const handleSaveToFirebase = async (game: Game) => {
    const toastId = toast.loading('מסנכרן עם Firebase...');
    try {
      const firebaseId = await saveGameToFirebase(game, userId);
      dispatch({
        type: 'SET_FIELD',
        field: 'createdGames',
        payload: createdGames.map(g =>
          g.id === game.id
            ? { ...g, syncedToFirebase: true, firebaseId }
            : g
        ),
      });
      toast.success('המשחק סונכרן עם Firebase!', { id: toastId });
    } catch (error) {
      console.error("Failed to save game to Firebase:", error);
      const message = error instanceof Error ? error.message : 'שמירת המשחק ל-Firebase נכשלה.';
      toast.error(message, { id: toastId });
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedPrompt);
    dispatch({ type: 'SET_FIELD', field: 'copied', payload: true });
    setTimeout(() => dispatch({ type: 'SET_FIELD', field: 'copied', payload: false }), 2000);
  };

  const resetForm = () => {
    dispatch({ type: 'RESET_FORM' });
  };

  const isFormValid = useMemo(() => {
    const basicValid = !!(targetAudience && gameType && gameDescription.trim() && additionalFeatures.trim());
    if (!basicValid) return false;
    if (targetAudience === 'children') return true;
    if (targetAudience === 'adults') return !!(userExperience.trim() && technicalRequirements.trim());
    return false;
  }, [targetAudience, gameType, gameDescription, additionalFeatures, userExperience, technicalRequirements]);

  const scrollToGallery = () => {
    galleryRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Storage Mode Indicator Component
  const StorageIndicator = () => (
    <div className="fixed top-4 left-4 bg-white rounded-lg shadow-md px-3 py-2 text-xs z-50">
      <div className="flex items-center gap-2">
        {STORAGE_MODE === 'hybrid' && (
          <>
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            </div>
            <span className="font-semibold">מצב משולב</span>
          </>
        )}
        {STORAGE_MODE === 'local' && (
          <>
            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
            <span className="font-semibold">אחסון מקומי</span>
          </>
        )}
        {STORAGE_MODE === 'firebase' && (
          <>
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="font-semibold">Firebase</span>
          </>
        )}
      </div>
    </div>
  );

  const handleCodeUpdate = useCallback(async (newCode: string): Promise<void> => {
    if (!playingGame) return;

    dispatch({ type: 'SET_GENERATED_GAME_CODE', payload: newCode });

    try {
      await updateGame(playingGame.id, newCode);
      dispatch({
        type: 'SET_FIELD',
        field: 'createdGames',
        payload: createdGames.map(g => (g.id === playingGame.id ? { ...g, code: newCode } : g)),
      });
      dispatch({
        type: 'SET_FIELD',
        field: 'playingGame',
        payload: { ...playingGame, code: newCode },
      });
    } catch (error) {
      console.error("Failed to save game changes:", error);
      throw new Error('שגיאה בשמירת השינויים.');
    }
  }, [playingGame, createdGames]);

  if (playingGame) {
    const handleRegenerateGame = async () => {
        if (!playingGame) return;

        dispatch({ type: 'SET_FIELD', field: 'isRegenerating', payload: true });
        const toastId = toast.loading('יוצר את המשחק מחדש...');

        try {
            const newCode = await generateGameCode(playingGame.prompt);
            await handleCodeUpdate(newCode);

            toast.success('המשחק נוצר מחדש בהצלחה!', { id: toastId });
        } catch (error) {
            console.error("Error regenerating game:", error);
            const message = error instanceof Error ? error.message : "נכשל שחזור המשחק.";
            toast.error(message, { id: toastId });
        } finally {
            dispatch({ type: 'SET_FIELD', field: 'isRegenerating', payload: false });
        }
    };


    return (
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <StorageIndicator />
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 flex items-center gap-3">
            <Gamepad2Icon className="w-8 h-8 text-indigo-600" />
            <span className="truncate">{playingGame.title}</span>
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRegenerateGame}
              disabled={isRegenerating || isGeneratingGameCode}
              className="bg-white border border-gray-300 hover:bg-gray-100 text-gray-800 px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
              title="צור מחדש את המשחק מהפרומפט המקורי"
              aria-label="Regenerate game"
            >
              {isRegenerating ? (
                <div className="w-5 h-5 border-2 border-gray-800 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <RefreshCwIcon className="w-5 h-5" />
              )}
              <span className="hidden sm:inline">צור מחדש</span>
            </button>
            <button onClick={stopPlaying} className="bg-white border border-gray-300 hover:bg-gray-100 text-gray-800 px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors text-sm sm:text-base">
              <XIcon className="w-5 h-5" />
              <span className="hidden sm:inline">חזור לגלריה</span>
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-start">
          <div className="flex flex-col gap-6">
            <DynamicGamePlayer isLoading={isGeneratingGameCode} gameCode={generatedGameCode} />
            <div className="bg-white border p-4 rounded-lg">
              <details>
                <summary className="font-semibold text-gray-800 cursor-pointer">
                  הצג את הפרומפט המקורי
                </summary>
                <p className="text-sm text-gray-700 mt-2">
                  <pre className="whitespace-pre-wrap font-sans text-gray-600">{playingGame.prompt}</pre>
                </p>
              </details>
            </div>
          </div>
          <div className="lg:sticky top-6">
            {isGeneratingGameCode ? (
                <div className="flex flex-col items-center justify-center h-[400px] sm:h-[448px] lg:h-[calc(600px-theme(space.6))] bg-white rounded-lg border shadow-sm">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="mt-4 text-gray-600 font-semibold">טוען את סביבת הפיתוח...</p>
                </div>
            ) : generatedGameCode ? (
              <GameChatBox
                gameCode={generatedGameCode}
                onUpdatedCode={handleCodeUpdate}
                gameTitle={playingGame.title}
              />
            ) : (
                <div className="flex flex-col items-center justify-center h-[400px] sm:h-[448px] lg:h-[calc(600px-theme(space.6))] bg-white rounded-lg border shadow-sm">
                    <XIcon className="w-12 h-12 text-red-400 mb-4" />
                    <p className="text-gray-600 font-semibold">שגיאה בטעינת קוד המשחק.</p>
                </div>
            )}
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="max-w-6xl mx-auto p-6">
      <StorageIndicator />
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-blue-600 mb-2 flex items-center justify-center gap-3">
          <Gamepad2Icon className="w-10 h-10" />
          מחולל ובונה משחקים
        </h1>
        <p className="text-gray-600 text-lg">מהרעיון למשחק מוכן - הסוכן האישי שלך ליצירת משחקים</p>
        <div className="mt-4 flex gap-3 justify-center">
          <button onClick={scrollToGallery} className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2">
            <MapPinIcon className="w-4 h-4" /> הגלריה שלי
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Left Column: Form */}
        <div className="space-y-6">
          <div className="bg-white shadow-sm border border-gray-200 p-4 rounded-lg">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-gray-700">
              <UserIcon className="w-5 h-5 text-blue-500" />
              שלב 1: בחר קהל יעד
            </h2>
            <div className="space-y-3">
              {(['children', 'adults'] as Audience[]).map(aud => (
                <label key={aud} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-blue-50 transition-colors ${targetAudience === aud ? 'bg-blue-50 border-blue-300' : 'border-gray-200'}`}>
                  <input type="radio" value={aud} checked={targetAudience === aud} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'targetAudience', payload: e.target.value as Audience })} className="w-4 h-4 text-blue-600 focus:ring-blue-500"/>
                  {aud === 'children' ? <UserIcon className="w-5 h-5 text-blue-600" /> : <UsersIcon className="w-5 h-5 text-green-600" />}
                  <div className="flex-1">
                    <div className="font-medium">{aud === 'children' ? 'ילדים' : 'מבוגרים ללא רקע טכני'}</div>
                    <div className="text-sm text-gray-600">{aud === 'children' ? 'פרומפט פשוט ומעורר השראה' : 'פרומפט מפורט ומובנה'}</div>
                  </div>
                  <button type="button" onClick={() => dispatch({ type: 'SET_FIELD', field: 'showExample', payload: showExample === aud ? null : aud })} className={`px-3 py-1 text-xs rounded-md transition-colors ${aud === 'children' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                    {showExample === aud ? 'הסתר' : 'דוגמה'}
                  </button>
                </label>
              ))}
            </div>
            {showExample && (
              <div className={`mt-4 ${showExample === 'children' ? 'bg-blue-50' : 'bg-green-50'} p-4 rounded-lg border-2 ${showExample === 'children' ? 'border-blue-200' : 'border-green-200'}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2"><FileTextIcon className={`w-5 h-5 ${showExample === 'children' ? 'text-blue-600' : 'text-green-600'}`}/> {getCurrentExample(showExample).title}</h3>
                  <button aria-label="Refresh example" onClick={() => refreshExample(showExample)} className={`px-3 py-1 text-xs ${showExample === 'children' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-green-100 text-green-700 hover:bg-green-200'} rounded-md transition-colors flex items-center gap-1`}>
                    <RefreshCwIcon className="w-3 h-3"/> דוגמה חדשה
                  </button>
                </div>
                <div className="bg-white p-4 rounded-lg border shadow-sm"><pre className="whitespace-pre-wrap text-sm leading-relaxed">{getCurrentExample(showExample).prompt}</pre></div>
              </div>
            )}
          </div>

          <div className="bg-white shadow-sm border border-gray-200 p-4 rounded-lg">
             <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-gray-700"><Gamepad2Icon className="w-5 h-5 text-green-500"/> שלב 2: פרטי המשחק</h2>
             <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">סוג המשחק <span className="text-red-500">*</span></label>
                <select value={gameType} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'gameType', payload: e.target.value })} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="">בחר סוג משחק...</option>
                  {GAME_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">תיאור המשחק <span className="text-red-500">*</span></label>
                <textarea value={gameDescription} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'gameDescription', payload: e.target.value })} placeholder="תאר בקצרה את הרעיון הבסיסי של המשחק..." className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-24"/>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">תכונות ורכיבים <span className="text-red-500">*</span></label>
                <textarea value={additionalFeatures} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'additionalFeatures', payload: e.target.value })} placeholder="שחקנים שיכולים לקפוץ&#10;כדור שמקפץ&#10;שערים משני הצדדים" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-28"/>
              </div>
              {targetAudience === 'adults' && (
                <>
                  <div><label className="block text-sm font-medium mb-1 text-gray-700">חוויית המשתמש <span className="text-red-500">*</span></label><textarea value={userExperience} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'userExperience', payload: e.target.value })} placeholder="מאותגר אבל לא מתוסכל..." className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-20"/></div>
                  <div><label className="block text-sm font-medium mb-1 text-gray-700">דרישות טכניות <span className="text-red-500">*</span></label><textarea value={technicalRequirements} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'technicalRequirements', payload: e.target.value })} placeholder="עובד בדפדפן ללא הורדה&#10;פועל על טלפון נייד" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-20"/></div>
                </>
              )}
             </div>
          </div>
          {(targetAudience && gameType && gameDescription.trim()) && (
            <div className="bg-purple-50 p-4 rounded-lg border-2 border-purple-200">
              <h3 className="text-lg font-semibold text-purple-700 mb-2">תצוגה מקדימה לפרומפט</h3>
              <div className="bg-white p-3 rounded-lg border shadow-sm max-h-48 overflow-y-auto"><pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{generatePreviewPrompt()}</pre></div>
            </div>
          )}
        </div>

        {/* Right Column: Output & Actions */}
        <div className="space-y-6">
           <div className="flex flex-col gap-4">
              <button onClick={handleGeneratePrompt} className={`w-full py-3 px-6 rounded-lg transition-all flex items-center justify-center gap-2 font-bold text-lg ${isFormValid ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`} disabled={!isFormValid || isGenerating}>
                {isGenerating ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>יוצר פרומפט חכם...</> : <><LightbulbIcon className="w-6 h-6"/> צור פרומפט חכם עם AI</>}
              </button>
              <button onClick={resetForm} className="w-full py-2 px-6 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors">איפוס טופס</button>
            </div>

            {generatedPrompt && !gameCreated && (
              <div className="bg-white shadow-sm border border-gray-200 p-4 rounded-lg">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-gray-700"><FileTextIcon className="w-5 h-5 text-blue-500"/> הפרומפט שלך מוכן</h2>
                <div className="bg-gray-50 p-4 rounded-lg border-r-4 border-blue-500 min-h-[150px]"><pre className="whitespace-pre-wrap text-sm leading-relaxed">{generatedPrompt}</pre></div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button onClick={copyToClipboard} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium">
                    {copied ? <CheckCircleIcon className="w-4 h-4"/> : <CopyIcon className="w-4 h-4"/>} {copied ? 'הועתק!' : 'העתק פרומפט'}
                  </button>
                  <button onClick={createGameFromPrompt} disabled={isCreatingGame} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors text-sm font-medium">
                    {isCreatingGame ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>בונה משחק...</> : <><Gamepad2Icon className="w-4 h-4"/> בנה את המשחק עם AI!</>}
                  </button>
                </div>
              </div>
            )}

            {gameCreated && unsavedGame && (
              <div className="bg-green-50 p-6 rounded-lg border-2 border-green-300 text-center">
                <CheckCircleIcon className="w-12 h-12 text-green-600 mx-auto mb-3"/>
                <h3 className="text-lg font-semibold text-green-800 mb-2">המשחק נוצר! 🎮</h3>
                <p className="text-green-700 mb-4">המשחק "{unsavedGame.title}" מוכן. האם תרצה לשמור אותו בגלריה?</p>
                <div className="flex gap-3 justify-center">
                   <button onClick={handleSaveGame} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">שמור לגלריה</button>
                  <button onClick={handleDiscardUnsavedGame} className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors">לא, תודה</button>
                </div>
              </div>
            )}

            {!generatedPrompt && !gameCreated && !isGenerating && (
              <div className="bg-white border-2 border-dashed border-gray-300 p-8 rounded-lg text-center flex flex-col items-center justify-center h-full">
                <LightbulbIcon className="w-16 h-16 text-gray-300 mx-auto mb-4"/>
                <h3 className="text-lg font-medium text-gray-600 mb-2">הפרומפט שלך יופיע כאן</h3>
                <p className="text-gray-500">מלא את הפרטים ולחץ על הכפתור כדי להתחיל.</p>
              </div>
            )}
        </div>
      </div>

      <div id="games-gallery" ref={galleryRef} className="mt-12 bg-white shadow-md border border-gray-200 p-6 rounded-lg">
        <h3 className="text-2xl font-semibold mb-6 flex items-center gap-2 text-indigo-700"><Gamepad2Icon className="w-6 h-6"/> הגלריה שלך ({createdGames.length})</h3>
        {isLoadingGames ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="mt-4 text-gray-600 font-semibold">טוען את המשחקים שלך...</p>
            </div>
        ) : createdGames.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <Gamepad2Icon className="w-16 h-16 text-gray-300 mx-auto mb-4"/>
            <h4 className="text-lg font-medium text-gray-600 mb-2">הגלריה שלך ריקה</h4>
            <p className="text-gray-500 mb-4">צור את המשחק הראשון שלך והוא יופיע כאן!</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {createdGames.map(game => (
              <div key={game.id} className="bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow p-4 border-l-4 border-indigo-500 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-semibold text-lg text-gray-800">{game.title}</h4>
                    {game.storageLocation && (
                       <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${game.storageLocation === 'local' ? 'bg-gray-200 text-gray-600' : 'bg-blue-100 text-blue-800'}`}>
                         {game.storageLocation === 'local' ? 'מקומי' : 'בענן'}
                       </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-3 h-12 overflow-hidden">{game.description}</p>
                  <div className="flex items-center gap-2 mb-4">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${game.audience === 'children' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{game.audience === 'children' ? 'ילדים' : 'מבוגרים'}</span>
                    <span className="text-xs text-gray-500">{new Date(game.createdAt).toLocaleString('he-IL')}</span>
                  </div>
                </div>
                <div className="space-y-2 mt-auto">
                  <button onClick={() => playGame(game)} className="w-full py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2">
                    <Gamepad2Icon className="w-4 h-4"/> שחק ושפר
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => copyGamePrompt(game.prompt)} className="w-full py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5">
                      <FileTextIcon className="w-4 h-4"/> פרומפט
                    </button>
                    <button onClick={() => deleteGame(game.id, game.storageLocation)} className="w-full py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5">
                        <XIcon className="w-4 h-4"/> מחק
                    </button>
                  </div>

                  {/* Sync/Status Logic */}
                  {(isHybridMode() || (STORAGE_MODE === 'local' && isFirebaseConfigured)) && game.storageLocation === 'local' && !game.syncedToFirebase && (
                    <button
                      onClick={() => handleSaveToFirebase(game)}
                      className="w-full py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5"
                    >
                      ☁️ סנכרן ל-Firebase
                    </button>
                  )}

                  {game.syncedToFirebase && (
                    <div className="w-full py-2 bg-green-100 text-green-700 rounded-lg text-sm text-center font-medium">
                      ✓ מסונכרן בענן
                    </div>
                  )}

                  <div className="text-xs text-gray-500 text-center">
                    {game.storageLocation === 'firebase' ? '☁️ שמור בענן' : '💾 שמור מקומית'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PromptGeneratorAgent;
