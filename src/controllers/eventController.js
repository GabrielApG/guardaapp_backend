const eventService        = require('../services/eventService');
const notificationService = require('../services/notificationService');

async function listEvents(req, res, next) {
  try {
    const events = await eventService.listByConnection(req.connectionId, req.query);
    res.json({ success: true, data: events });
  } catch (err) { next(err); }
}

async function createEvent(req, res, next) {
  try {
    const event = await eventService.create(req.connectionId, req.userId, req.body);
    await notificationService.notifyEventChange(req.connectionId, req.userId, event.id);
    res.status(201).json({ success: true, data: event });
  } catch (err) { next(err); }
}

async function getEvent(req, res, next) {
  try {
    const event = await eventService.findById(req.params.eventId, req.connectionId);
    if (!event) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Evento não encontrado.' } });
    res.json({ success: true, data: event });
  } catch (err) { next(err); }
}

async function updateEvent(req, res, next) {
  try {
    await eventService.update(req.params.eventId, req.userId, req.body);
    const event = await eventService.findById(req.params.eventId, req.connectionId);
    await notificationService.notifyEventChange(req.connectionId, req.userId, event.id);
    res.json({ success: true, data: event });
  } catch (err) { next(err); }
}

async function deleteEvent(req, res, next) {
  try {
    await eventService.softDelete(req.params.eventId, req.userId);
    res.json({ success: true, data: { message: 'Evento cancelado.' } });
  } catch (err) { next(err); }
}

async function confirmEvent(req, res, next) {
  try {
    const event = await eventService.setConfirmation(req.params.eventId, req.userId, 'confirmed');
    await notificationService.notifyEventChange(req.connectionId, req.userId, req.params.eventId);
    res.json({ success: true, data: event });
  } catch (err) { next(err); }
}

async function declineEvent(req, res, next) {
  try {
    const event = await eventService.setConfirmation(req.params.eventId, req.userId, 'declined');
    await notificationService.notifyEventChange(req.connectionId, req.userId, req.params.eventId);
    res.json({ success: true, data: event });
  } catch (err) { next(err); }
}

module.exports = { listEvents, createEvent, getEvent, updateEvent, deleteEvent, confirmEvent, declineEvent };
