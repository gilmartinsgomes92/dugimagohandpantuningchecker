import React, { createContext, useContext, useReducer, ReactNode } from 'react';

// Define the shape of your state and actions
interface State {
    // ... your state properties
}

interface Action {
    // ... your action properties
}

const initialState: State = {
    // ... your initial state
};

const AppContext = createContext<[State, React.Dispatch<Action>] | undefined>(undefined);

const appReducer = (state: State, action: Action): State => {
    switch (action.type) {
        // ... your cases
        default:
            return state;
    }
};

interface AppProviderProps {
    children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
    const [state, dispatch] = useReducer(appReducer, initialState);

    return (
        <AppContext.Provider value={[state, dispatch]}>
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