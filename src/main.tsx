import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './ui/theme'; // áp dụng theme (light/dark) sớm nhất, tránh nháy màu khi mount
import './ui/i18n'; // khởi tạo ngôn ngữ (VI/JA) từ localStorage

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
