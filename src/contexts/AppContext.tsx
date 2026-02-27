import React, { createContext, useContext, useReducer } from 'react';
import { ReactNode } from 'react';

// Define the ContextAction interface for dispatch actions
interface ContextAction {
    type: string;
    payload?: any;
}

// Define the state structure for the context
interface AppState {
    // Add your state properties here
}

const initialState: AppState = {
    // Initialize your state properties here
};

const AppContext = createContext<{state: AppState; dispatch: React.Dispatch<ContextAction>} | undefined>(undefined);

const appReducer = (state: AppState, action: ContextAction): AppState => {
    switch (action.type) {
        // Define your cases here
        default:
            return state;
    }
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
    const [state, dispatch] = useReducer(appReducer, initialState);

    return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};
