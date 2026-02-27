import { createContext, useContext, useReducer, type ReactNode } from 'react';

interface Action {
    type: string;
    payload?: any;
}

interface AppState {
    user: any;
    isSubscribed: boolean;
    tuningSession: any;
    navigation: string;
}

const initialState: AppState = {
    user: null,
    isSubscribed: false,
    tuningSession: null,
    navigation: '',
};

const appReducer = (state: AppState, action: Action): AppState => {
    switch (action.type) {
        case 'SET_USER':
            return { ...state, user: action.payload };
        case 'SET_SUBSCRIPTION':
            return { ...state, isSubscribed: action.payload };
        case 'SET_TUNING_SESSION':
            return { ...state, tuningSession: action.payload };
        case 'SET_NAVIGATION':
            return { ...state, navigation: action.payload };
        default:
            return state;
    }
};

interface AppContextType {
    state: AppState;
    dispatch: React.Dispatch<Action>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
    children: ReactNode;
}

export const AppProvider = ({ children }: AppProviderProps) => {
    const [state, dispatch] = useReducer(appReducer, initialState);

    return (
        <AppContext.Provider value={{ state, dispatch }}>
            {children}
        </AppContext.Provider>
    );
};

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

export default AppContext;