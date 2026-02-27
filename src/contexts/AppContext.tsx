import React, { createContext, useContext, useReducer } from 'react';

// Define the initial state of our context
const initialState = {
    user: null,
    isSubscribed: false,
    tuningSession: null,
    navigation: '',
};

// Define our context types
const AppContext = createContext();

// Define a reducer to manage state updates
const appReducer = (state, action) => {
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

// Create a provider component
export const AppProvider = ({ children }) => {
    const [state, dispatch] = useReducer(appReducer, initialState);

    return (
        <AppContext.Provider value={{ state, dispatch }}>
            {children}
        </AppContext.Provider>
    );
};

// Create a custom hook for using the context
export const useAppContext = () => {
    return useContext(AppContext);
};

export default AppContext;