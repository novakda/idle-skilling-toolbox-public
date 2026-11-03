import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { installTableSort } from './table-sort'

const app = createApp(App)
installTableSort(app)
app.mount('#app')
