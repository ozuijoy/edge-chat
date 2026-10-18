import { nextTick, onMounted, watch } from 'vue';

export function calculateCursorLeft({
  textWidth,
  scrollLeft,
  paddingLeft,
  paddingRight,
  viewportWidth,
  cursorWidth
}) {
  const visibleLeft = paddingLeft;
  const visibleRight = Math.max(visibleLeft, viewportWidth - paddingRight - cursorWidth);
  const textPosition = paddingLeft + textWidth - scrollLeft;

  return Math.min(visibleRight, Math.max(visibleLeft, textPosition));
}

function updateCursor(input, cursor) {
  if (!input || !cursor) return;

  const selectionStart = input.selectionStart;
  let displayText = input.value.substring(0, selectionStart);
  if (input.type === 'password') {
    displayText = '\u2022'.repeat(selectionStart);
  }

  const inputStyle = getComputedStyle(input);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = inputStyle.font;
  const textWidth = ctx.measureText(displayText).width;

  const inputRect = input.getBoundingClientRect();
  const paddingLeft = parseFloat(inputStyle.paddingLeft);
  const paddingRight = parseFloat(inputStyle.paddingRight);

  const cursorHeight = 24;
  const cursorTop = (inputRect.height - cursorHeight) / 2;

  cursor.style.left = `${calculateCursorLeft({
    textWidth,
    scrollLeft: input.scrollLeft,
    paddingLeft,
    paddingRight,
    viewportWidth: input.clientWidth,
    cursorWidth: cursor.offsetWidth
  })}px`;
  cursor.style.top = `${cursorTop}px`;
  cursor.style.height = `${cursorHeight}px`;
}

function setupCursorPair(inputRef, cursorRef) {
  const input = inputRef.value;
  const cursor = cursorRef.value;
  if (!input || !cursor) return;

  const update = () => updateCursor(input, cursor);

  input.addEventListener('focus', () => {
    cursor.classList.add('visible');
    update();
  });

  input.addEventListener('blur', () => {
    cursor.classList.remove('visible');
  });

  input.addEventListener('input', update);
  input.addEventListener('click', update);
  input.addEventListener('keyup', update);
  input.addEventListener('select', update);
  input.addEventListener('scroll', update);
}

export function useCursor(pairs, when) {
  const setup = () => {
    nextTick(() => {
      pairs.forEach(([inputRef, cursorRef]) => {
        setupCursorPair(inputRef, cursorRef);
      });
    });
  };

  if (when) {
    watch(when, (val) => {
      if (val) setup();
    });
  } else {
    onMounted(setup);
  }
}
