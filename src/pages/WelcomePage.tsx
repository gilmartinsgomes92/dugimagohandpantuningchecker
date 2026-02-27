import React from 'react';

const WelcomePage: React.FC = () => {
    const handleStartEvaluation = () => {
        // Logic for starting evaluation
        console.log('Evaluation started');
    };

    const handleLogin = () => {
        // Logic for user login
        console.log('User logged in');
    };

    return (
        <div>
            <h1>Welcome to the App!</h1>
            <p>This app helps you with feature X, Y, and Z.</p>
            <button onClick={handleStartEvaluation}>Start Evaluation</button>
            <button onClick={handleLogin}>Login</button>
        </div>
    );
};

export default WelcomePage;