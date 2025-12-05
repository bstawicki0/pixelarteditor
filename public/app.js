// Połączenie z serwerem Socket.IO
const socket = io();

// Elementy canvas i UI
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const gridCanvas = document.getElementById('grid');
const gridCtx = gridCanvas.getContext('2d');
const eraserBtn = document.getElementById('eraser-btn')
const colorPicker = document.getElementById('color-picker');
const clearBtn = document.getElementById('clear-btn');
const saveBtn = document.getElementById('save-btn');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const shadeSlider = document.getElementById('shade');
const gridWidthInput = document.getElementById('grid-width');
const gridHeightInput = document.getElementById('grid-height');
const resizeBtn = document.getElementById('resize-btn');
const nightModeBtn = document.getElementById('night-mode-btn');
const brushSizeSelect = document.getElementById('brushSize');
const brushIncreaseBtn = document.getElementById('brush-increase');
const brushDecreaseBtn = document.getElementById('brush-decrease');
brushDecreaseBtn.disabled = true;
brushSizeSelect.value = 1;


let zoomLevel = 1;
const ZOOM_STEP = 0.1;
const MAX_ZOOM = 20;
const MIN_ZOOM = 0.1;
let nr = 0;
let ntr = 1;
let gridWidth = 32;
let gridHeight = 32;
let pixelSize = 20;
let isDrawing = false;
let currentColor = colorPicker.value;
let undoStack = [];
let redoStack = [];
let brushSize = parseInt(brushSizeSelect.value);
let isPipetteActive = false;
let isEraserActive = false;

// Ustawienia canvas
function setCanvas() {
  canvas.width = gridWidth * pixelSize;
  canvas.height = gridHeight * pixelSize;
  gridCanvas.width = gridWidth * pixelSize;
  gridCanvas.height = gridHeight * pixelSize;
  drawGrid();
}

function drawGrid() {
  gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
  gridCtx.strokeStyle = '#ccc';
  for (let x = 0; x <= gridWidth; x++) {
    gridCtx.beginPath();
    gridCtx.moveTo(x * pixelSize, 0);
    gridCtx.lineTo(x * pixelSize, gridCanvas.height);
    gridCtx.stroke();
  }
  for (let y = 0; y <= gridHeight; y++) {
    gridCtx.beginPath();
    gridCtx.moveTo(0, y * pixelSize);
    gridCtx.lineTo(gridCanvas.width, y * pixelSize);
    gridCtx.stroke();
  }
}

// Kolory bazowe
const basicColors = [
  "#FFFFFF", "#FF0000", "#028bed", "#0eeb15", "#000000",
  "#FFA500", "#82440a", "#f760ed","#f9fc30", "#f59920",
  "#964B00", "#808080", "#FFFF00", "#00FF00", "#00FFFF",
  "#0000FF", "#800080", "#FFC0CB", "#A52A2A", "#808000"
];
const basicColorsContainer = document.getElementById("basic-colors");
basicColors.forEach(color => {
  const btn = document.createElement("div");
  btn.className = "color-btn";
  btn.style.backgroundColor = color;
  btn.addEventListener("click", () => {
    currentColor = color;
    colorPicker.value = color;
  });
  basicColorsContainer.appendChild(btn);
});

colorPicker.addEventListener('input', (e) => currentColor = e.target.value);

// Funkcje pomocnicze koloru
function hexToRgb(hex) {
  hex = hex.replace("#", "");
  const bigint = parseInt(hex, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}
function rgbToHex(r,g,b){ return "#" + ((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1); }
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h,s,l = (max+min)/2;
  if(max===min){h=s=0;}
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch(max){
      case r: h = (g - b)/d + (g < b ? 6 : 0); break;
      case g: h = (b - r)/d + 2; break;
      case b: h = (r - g)/d + 4; break;
    }
    h /= 6;
  }
  return {h,s,l};
}
function hslToRgb(h,s,l){
  let r,g,b;
  if(s===0){r=g=b=l;}
  else{
    const hue2rgb=(p,q,t)=>{
      if(t<0)t+=1;
      if(t>1)t-=1;
      if(t<1/6)return p+(q-p)*6*t;
      if(t<1/2)return q;
      if(t<2/3)return p+(q-p)*(2/3-t)*6;
      return p;
    };
    const q=l<0.5?l*(1+s):l+s-l*s;
    const p=2*l-q;
    r=hue2rgb(p,q,h+1/3);
    g=hue2rgb(p,q,h);
    b=hue2rgb(p,q,h-1/3);
  }
  return {r:Math.round(r*255),g:Math.round(g*255),b:Math.round(b*255)};
}
function shadeColor(hex, amount){
  const rgb = hexToRgb(hex);
  let hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  hsl.l *= (1 - amount/100);
  const shaded = hslToRgb(hsl.h, hsl.s, hsl.l);
  return rgbToHex(shaded.r, shaded.g, shaded.b);
}

// rysowanie pixeli i emitowanie rozmiaru pedzla
function drawPixel(x, y, emit = true, color = null, size = null) {
  const brush = (typeof size === 'number' && size > 0) ? size : brushSize;

  const offset = Math.floor(brush / 2);
  const startX = x - offset;
  const startY = y - offset;

  const isErase = (color === 'erase') || (isEraserActive && color === null);

  if (isErase) {
    for (let dx = 0; dx < brush; dx++) {
      for (let dy = 0; dy < brush; dy++) {
        const px = startX + dx;
        const py = startY + dy;
        if (px >= 0 && py >= 0 && px < gridWidth && py < gridHeight) {
          ctx.clearRect(px * pixelSize, py * pixelSize, pixelSize, pixelSize);
        }
      }
    }

    if (emit && socket) {
      socket.emit("draw_pixel", { x, y, color: 'erase', size: brush });
    }
    return;
  }

  let colorToDraw = color || currentColor;
  if (shadeSlider && shadeSlider.value > 0 && !color) {
    colorToDraw = shadeColor(currentColor, parseInt(shadeSlider.value));
  }

  ctx.fillStyle = colorToDraw;

  for (let dx = 0; dx < brush; dx++) {
    for (let dy = 0; dy < brush; dy++) {
      const px = startX + dx;
      const py = startY + dy;
      if (px >= 0 && py >= 0 && px < gridWidth && py < gridHeight) {
        ctx.fillRect(px * pixelSize, py * pixelSize, pixelSize, pixelSize);
      }
    }
  }

  if (emit && socket) {
    socket.emit("draw_pixel", { x, y, color: colorToDraw, size: brush });
  }
}
//koniec zmian

function saveState(){
  undoStack.push(ctx.getImageData(0,0,canvas.width,canvas.height));
  redoStack = [];
}

// Cofanie i przywracanie z synchronizacją
function undo(emit = true) {
  if (undoStack.length > 0) {
    redoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    const prev = undoStack.pop();
    ctx.putImageData(prev, 0, 0);

    // Send full updated canvas image to others
    if (emit && socket) {
      const data = canvas.toDataURL("image/png");
      socket.emit("undo_action", data);
    }
  }
}

function redo(emit = true) {
  if (redoStack.length > 0) {
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    const next = redoStack.pop();
    ctx.putImageData(next, 0, 0);

    // Send full updated canvas image to others
    if (emit && socket) {
      const data = canvas.toDataURL("image/png");
      socket.emit("redo_action", data);
    }
  }
}


// Rysowanie myszy
canvas.addEventListener('mousedown', e => {
  //zmiana potrzebna do pipety 1.01 sigma
 if (!isPipetteActive) {
    saveState();
    isDrawing = true;
}
//zmiana potrzebna do pipety konczy sie tutaj
});

eraserBtn.addEventListener('click', () => {
  isEraserActive = !isEraserActive;
  eraserBtn.classList.toggle('active');
  
  if (isPipetteActive) {
    isPipetteActive = false;
    pipetteBtn.classList.remove('active');
  }
  if(isEraserActive){
      canvas.style.cursor = "url('img/gumka.png') 0 16, auto";
  } else{
    canvas.style.cursor = 'crosshair';
  }
});

canvas.addEventListener('mouseup', () => isDrawing = false);
canvas.addEventListener('mousemove', e => {
  if (!isDrawing) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / (pixelSize * zoomLevel));
  const y = Math.floor((e.clientY - rect.top) / (pixelSize * zoomLevel));
  drawPixel(x, y);
  
});

canvas.addEventListener("scroll", () => {
  applyZoom()
});
// Przyciski akcji
undoBtn.addEventListener('click', () => undo());
redoBtn.addEventListener('click', () => redo());
clearBtn.addEventListener('click', () => {
  saveState();
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawGrid();
  socket.emit("clear_canvas");
});
saveBtn.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'pixel-art.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

// Otwieranie pliku z dysku i rysowanie go na canvasie
const openBtn = document.getElementById('open-btn');
const openFileInput = document.getElementById('open-file');

if (openBtn && openFileInput) {
  openBtn.addEventListener('click', () => openFileInput.click());
  
  openFileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) {
      console.log('Nie wybrano pliku.');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = function(event) {
      const img = new Image();
      img.onload = function() {
        try {
          saveState();
        } catch (err) {
          console.warn('Nie można zapisać stanu przed wczytaniem:', err);
        }
        
        // Odczytaj rozmiar obrazu w pikselach
        const imageWidth = img.naturalWidth || img.width;
        const imageHeight = img.naturalHeight || img.height;
        
        if (!imageWidth || !imageHeight) {
          console.error('Nie udało się odczytać rozmiaru obrazu');
          alert('Błąd wczytywania obrazu');
          return;
        }
        
        console.log('Wczytano obraz o rozmiarze:', imageWidth, 'x', imageHeight, 'pikseli');
        
        // KLUCZOWE: Sprawdź czy obraz jest podzielny przez pixelSize
        // Jeśli tak, to prawdopodobnie jest to obraz z tego edytora
        if (imageWidth % pixelSize === 0 && imageHeight % pixelSize === 0) {
          // Obraz pochodzi z tego edytora - podziel przez pixelSize aby uzyskać rozmiar siatki
          gridWidth = imageWidth / pixelSize;
          gridHeight = imageHeight / pixelSize;
          console.log('Wykryto obraz z edytora, rozmiar siatki:', gridWidth, 'x', gridHeight);
        } else {
          // Obraz zewnętrzny - użyj jego rzeczywistego rozmiaru jako rozmiar siatki
          gridWidth = imageWidth;
          gridHeight = imageHeight;
          console.log('Obraz zewnętrzny, każdy piksel = jeden kwadrat siatki');
        }
        
        // Zaktualizuj pola input w UI
        gridWidthInput.value = gridWidth;
        gridHeightInput.value = gridHeight;
        
        // Ustaw rozmiar canvas
        canvas.width = gridWidth * pixelSize;
        canvas.height = gridHeight * pixelSize;
        gridCanvas.width = gridWidth * pixelSize;
        gridCanvas.height = gridHeight * pixelSize;
        
        // Wyłącz wygładzanie
        ctx.imageSmoothingEnabled = false;
        ctx.mozImageSmoothingEnabled = false;
        ctx.webkitImageSmoothingEnabled = false;
        ctx.msImageSmoothingEnabled = false;
        gridCtx.imageSmoothingEnabled = false;
        
        // Wyczyść canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Narysuj obraz na całym canvas (dopasuje się automatycznie)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Narysuj siatkę
        drawGrid();
        
        // Wyślij stan do innych klientów przez Socket.IO
        if (socket && socket.connected) {
          socket.emit('load_canvas_state', canvas.toDataURL());
        }
        
        console.log('Obraz wczytany pomyślnie! Siatka:', gridWidth, 'x', gridHeight);
      };
      
      img.onerror = function() {
        console.error('Błąd ładowania obrazu');
        alert('Nie udało się wczytać obrazu');
      };
      
      img.src = event.target.result;
    };
    
    reader.onerror = function() {
      console.error('Błąd odczytu pliku');
      alert('Nie udało się odczytać pliku');
    };
    
    reader.readAsDataURL(file);
  });
} else {
  console.warn('Przycisk Open lub input file nie został znaleziony');
}

resizeBtn.addEventListener('click', () => {
  
  const newWidth = parseInt(gridWidthInput.value);
  const newHeight = parseInt(gridHeightInput.value);
  if(gridWidth !== newWidth || newHeight !== gridHeight){
    if(newWidth>=4 && newWidth<=2000 && newHeight>=4 && newHeight<=2000){
      gridWidth = newWidth;
      gridHeight = newHeight;
      setCanvas();
      ctx.clearRect(0,0,canvas.width,canvas.height);
  } else {
    alert("Width and height must be between 4 and 2000.");
  }
}
});

// Pipeta 1.01 sigma
const pipetteBtn = document.createElement('button');
pipetteBtn.id = 'pipette-btn';
pipetteBtn.className = 'icon-btn';
pipetteBtn.title = 'Pipette Tool 🎨';
pipetteBtn.textContent = '';
document.querySelector('.navbar-icons').insertBefore(pipetteBtn, undoBtn);

pipetteBtn.addEventListener('click', () => {
    isPipetteActive = !isPipetteActive;
    pipetteBtn.classList.toggle('active');
    canvas.style.cursor = isPipetteActive ? 'copy' : 'crosshair';
});

// SINGLE pipette event listener (no duplicates)
canvas.addEventListener("mousedown", (e) => {
    if (!isPipetteActive) return;

    const rect = canvas.getBoundingClientRect();

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;

    const gridX = Math.floor(canvasX / pixelSize);
    const gridY = Math.floor(canvasY / pixelSize);

    if (gridX < 0 || gridY < 0 || gridX >= gridWidth || gridY >= gridHeight) {
        isPipetteActive = false;
        pipetteBtn.classList.remove("active");
        canvas.style.cursor = "crosshair";
        return;
    }

    const readX = gridX * pixelSize;
    const readY = gridY * pixelSize;

    const pixel = ctx.getImageData(readX, readY, 1, 1).data;
    const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);

    currentColor = hex;
    colorPicker.value = hex;

    isPipetteActive = false;
    pipetteBtn.classList.remove("active");
    canvas.style.cursor = "crosshair";
});



// Zmiana rozmiaru pędzla
brushIncreaseBtn.addEventListener('click', () => {
  let newSize = Math.min(10, brushSize + 1);
  brushSize = newSize;
  brushSizeSelect.value = newSize;
    brushDecreaseBtn.disabled = false;
  ntr ++;
  if(ntr % 2 == 1 && ntr > 1){
  nr ++;
  }
});

  brushDecreaseBtn.addEventListener('click', () => {
  let newSize = Math.max(1, brushSize - 1);
  brushSize = newSize;
  brushSizeSelect.value = newSize;
    if(brushSize == 1){
      brushDecreaseBtn.disabled = true;
    }
  if(ntr % 2 == 1 && ntr > 1){
  nr --;
  }
  ntr --;

});
function applyZoom() {
  const scale = `scale(${zoomLevel})`;
  canvas.style.transform = scale;
  gridCanvas.style.transform = scale;
  canvas.style.transformOrigin = '0 0';
  gridCanvas.style.transformOrigin = '0 0';

   const wrapper = document.querySelector('.canvas-wrapper');
  wrapper.style.width = `${canvas.width * zoomLevel}px`;
  wrapper.style.height = `${canvas.height * zoomLevel}px`;
}
//IKONKI SIGMA
const zoomInBtn = document.createElement('button');
zoomInBtn.innerHTML = `<img src="img/plus.png" alt="Zoom In">`;
zoomInBtn.title = 'Zoom In';
zoomInBtn.className = 'icon-btn';
document.querySelector('.navbar-icons').appendChild(zoomInBtn);

const zoomOutBtn = document.createElement('button');
zoomOutBtn.innerHTML = `<img src="img/minus.png" alt="Zoom In"></img>`;
zoomOutBtn.title = 'Zoom Out';
zoomOutBtn.className = 'icon-btn';
document.querySelector('.navbar-icons').appendChild(zoomOutBtn);
zoomInBtn.addEventListener('click', () => {
  zoomLevel = Math.min(MAX_ZOOM, zoomLevel + ZOOM_STEP);
  applyZoom();
});

zoomOutBtn.addEventListener('click', () => {
  zoomLevel = Math.max(MIN_ZOOM, zoomLevel - ZOOM_STEP);
  applyZoom();
});

// Skróty klawiaturowe
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); redo(); }
  if (e.key.toLowerCase() === 'p') pipetteBtn.click();
  if (e.key.toLowerCase() === 'r') resizeBtn.click();
  if (e.key.toLowerCase() === 'delete' || e.key.toLowerCase() === 'backspace') clearBtn.click();
  if (e.key.toLowerCase() === 'e') eraserBtn.click();
  if (e.key === '=') brushIncreaseBtn.click();
  if (e.key === '-') brushDecreaseBtn.click();
});

// Inicjalizacja
setCanvas();

// Socket.IO – synchronizacja
socket.on("draw_pixel", data => drawPixel(data.x, data.y, false, data.color, data.size));
socket.on("clear_canvas", () => { ctx.clearRect(0,0,canvas.width,canvas.height); drawGrid(); });
socket.on("undo_action", () => undo(false));
socket.on("redo_action", () => redo(false));


socket.on("request_canvas_state", () => {
  const data = canvas.toDataURL();
  socket.emit("send_canvas_state", data);
});
socket.on("load_canvas_state", (imgData) => {
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  };
  img.src = imgData;
});

// Ulepszona synchronizacja load_canvas_state
socket.on("load_canvas_state", (imgData) => {
  const img = new Image();
  img.onload = () => {
    // Sprawdź czy obraz ma inny rozmiar niż obecny canvas
    const imageWidth = img.naturalWidth || img.width;
    const imageHeight = img.naturalHeight || img.height;
    
    // Oblicz rozmiar siatki z obrazu
    let newGridWidth = gridWidth;
    let newGridHeight = gridHeight;
    
    if (imageWidth % pixelSize === 0 && imageHeight % pixelSize === 0) {
      // Obraz z edytora - podziel przez pixelSize
      newGridWidth = imageWidth / pixelSize;
      newGridHeight = imageHeight / pixelSize;
    } else {
      // Obraz zewnętrzny - użyj bezpośrednio
      newGridWidth = imageWidth;
      newGridHeight = imageHeight;
    }
    
    // Jeśli rozmiar się zmienił, zaktualizuj canvas
    if (newGridWidth !== gridWidth || newGridHeight !== gridHeight) {
      gridWidth = newGridWidth;
      gridHeight = newGridHeight;
      
      // Zaktualizuj pola input
      if (gridWidthInput) gridWidthInput.value = gridWidth;
      if (gridHeightInput) gridHeightInput.value = gridHeight;
      
      // Zmień rozmiar canvas
      canvas.width = gridWidth * pixelSize;
      canvas.height = gridHeight * pixelSize;
      gridCanvas.width = gridWidth * pixelSize;
      gridCanvas.height = gridHeight * pixelSize;
      
      // Wyłącz wygładzanie
      ctx.imageSmoothingEnabled = false;
      ctx.mozImageSmoothingEnabled = false;
      ctx.webkitImageSmoothingEnabled = false;
      ctx.msImageSmoothingEnabled = false;
      gridCtx.imageSmoothingEnabled = false;
    }
    
    // Wyczyść i narysuj obraz
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    // Narysuj siatkę
    drawGrid();
    
    console.log('Zsynchronizowano canvas z innym użytkownikiem');
  };
  img.src = imgData;
});

socket.emit("new_client_ready");

