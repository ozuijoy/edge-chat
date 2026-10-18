const DEFAULT_RECONNECT_DELAYS = [1000, 2000, 5000];

function isSocketOpen(socket) {
	return socket?.readyState === 1;
}

function shouldReconnectByDefault(event) {
	const code = Number(event?.code || 0);
	return ![1000, 1008, 4401, 4403].includes(code);
}

function frameToText(frame) {
	if (typeof frame === "string") {
		return frame;
	}
	if (frame instanceof ArrayBuffer) {
		return new TextDecoder().decode(frame);
	}
	if (ArrayBuffer.isView(frame)) {
		return new TextDecoder().decode(frame);
	}
	return String(frame ?? "");
}

export function parseRealtimeFrame(frame) {
	const text = frameToText(frame);
	try {
		return JSON.parse(text);
	} catch {
		return { type: "system", message: text };
	}
}

export function createRealtimeSession({
	openConnection,
	onMessage,
	onStatus,
	onClose,
	shouldReconnect = shouldReconnectByDefault,
	reconnectDelays = DEFAULT_RECONNECT_DELAYS,
	parseFrame = parseRealtimeFrame,
}) {
	let activeSocket = null;
	let activeKey = "";
	let connectingSocket = null;
	let connectingKey = "";
	let connectionGeneration = 0;
	let reconnectTimer = null;
	let reconnectAttempt = 0;
	let desiredConnection = null;
	const intentionallyClosingSockets = new WeakSet();
	const deferredCloseSockets = new Set();

	function emitStatus(event) {
		onStatus?.(event);
	}

	function markSocketForClose(socket) {
		if (!socket) {
			return;
		}

		intentionallyClosingSockets.add(socket);
		try {
			socket.close();
		} catch {
			intentionallyClosingSockets.delete(socket);
		}
	}

	function clearReconnectTimer() {
		if (reconnectTimer !== null) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
	}

	function flushDeferredSockets(exceptSocket = null) {
		for (const socket of deferredCloseSockets) {
			deferredCloseSockets.delete(socket);
			if (!socket || socket === exceptSocket) {
				continue;
			}
			if (socket === activeSocket) {
				activeSocket = null;
				activeKey = "";
			}
			markSocketForClose(socket);
		}
	}

	function scheduleReconnect(event, generation) {
		if (
			!desiredConnection ||
			generation !== connectionGeneration ||
			!shouldReconnect(event)
		) {
			return;
		}

		const delay = reconnectDelays[
			Math.min(reconnectAttempt, reconnectDelays.length - 1)
		];
		reconnectAttempt += 1;
		clearReconnectTimer();
		emitStatus({
			status: "reconnecting",
			key: desiredConnection.key,
			delay,
		});
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			if (desiredConnection && generation === connectionGeneration) {
				startConnection(desiredConnection.key, desiredConnection.params, true);
			}
		}, delay);
	}

	function handleConnectionStatus(event, socket, generation, key) {
		if (intentionallyClosingSockets.has(socket)) {
			if (event.status === "closed") {
				intentionallyClosingSockets.delete(socket);
				deferredCloseSockets.delete(socket);
			}
			return;
		}

		if (generation !== connectionGeneration || socket !== connectingSocket && socket !== activeSocket) {
			return;
		}

		if (event.status === "open") {
			activeSocket = socket;
			activeKey = key;
			connectingSocket = null;
			connectingKey = "";
			reconnectAttempt = 0;
			flushDeferredSockets(socket);
			emitStatus({ ...event, key });
			return;
		}

		if (event.status === "error") {
			flushDeferredSockets(socket);
			emitStatus({ ...event, key });
			return;
		}

		if (event.status === "closed") {
			if (socket === connectingSocket) {
				connectingSocket = null;
				connectingKey = "";
			}
			if (socket === activeSocket) {
				activeSocket = null;
				activeKey = "";
			}
			flushDeferredSockets(socket);
			emitStatus({ ...event, key });
			onClose?.({ ...event, key });
			scheduleReconnect(event, generation);
		}
	}

	function startConnection(key, params, reconnecting = false) {
		const generation = connectionGeneration + 1;
		connectionGeneration = generation;
		if (connectingSocket) {
			// 尚未建立的旧连接没有承载业务消息，切换意图时立即关闭，避免留下无法复用的幽灵连接。
			markSocketForClose(connectingSocket);
			connectingSocket = null;
			connectingKey = "";
		}
		if (activeSocket) {
			deferredCloseSockets.add(activeSocket);
		}

		emitStatus({ status: reconnecting ? "reconnecting" : "connecting", key });
		let socket = null;
		const queuedStatuses = [];
		const queuedMessages = [];
		socket = openConnection(params, {
			onStatus(event) {
				if (!socket) {
					queuedStatuses.push(event);
					return;
				}
				handleConnectionStatus(event, event.socket || socket, generation, key);
			},
			onMessage(frame, sourceSocket) {
				if (!socket) {
					queuedMessages.push([frame, sourceSocket]);
					return;
				}
				if (
					generation !== connectionGeneration ||
					sourceSocket !== activeSocket ||
					activeKey !== key
				) {
					return;
				}
				onMessage?.(parseFrame(frame), { key, socket: sourceSocket });
			},
		});
		connectingSocket = socket;
		connectingKey = key;
		for (const event of queuedStatuses) {
			handleConnectionStatus(event, event.socket || socket, generation, key);
		}
		for (const [frame, sourceSocket] of queuedMessages) {
			if (
				generation === connectionGeneration &&
				sourceSocket === activeSocket &&
				activeKey === key
			) {
				onMessage?.(parseFrame(frame), { key, socket: sourceSocket });
			}
		}
	}

	function connect(key, params = {}) {
		if (!key) {
			return;
		}

		desiredConnection = { key, params };
		clearReconnectTimer();
		if (
			(connectingKey === key && connectingSocket?.readyState === 0) ||
			(activeKey === key && isSocketOpen(activeSocket))
		) {
			return;
		}

		startConnection(key, params);
	}

	function disconnect() {
		desiredConnection = null;
		connectionGeneration += 1;
		reconnectAttempt = 0;
		clearReconnectTimer();
		flushDeferredSockets();
		markSocketForClose(connectingSocket);
		markSocketForClose(activeSocket);
		connectingSocket = null;
		connectingKey = "";
		activeSocket = null;
		activeKey = "";
		emitStatus({ status: "closed", key: "" });
	}

	function isOpenFor(key) {
		return activeKey === key && isSocketOpen(activeSocket);
	}

	function send(data, key) {
		if (!isOpenFor(key)) {
			return false;
		}
		activeSocket.send(data);
		return true;
	}

	return {
		connect,
		disconnect,
		isOpenFor,
		send,
	};
}
