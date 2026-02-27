import React from 'react';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import Welcome from './pages/Welcome';
import ScaleSelection from './pages/ScaleSelection';
import GuidedTuning from './pages/GuidedTuning';
import Results from './pages/Results';
import Contact from './pages/Contact';
import Profile from './pages/Profile';
import Settings from './pages/Settings';

const App = () => {
  return (
    <Router>
      <Switch>
        <Route path='/' exact component={Welcome} />
        <Route path='/scale-selection' component={ScaleSelection} />
        <Route path='/guided-tuning' component={GuidedTuning} />
        <Route path='/results' component={Results} />
        <Route path='/contact' component={Contact} />
        <Route path='/profile' component={Profile} />
        <Route path='/settings' component={Settings} />
      </Switch>
    </Router>
  );
};

export default App;