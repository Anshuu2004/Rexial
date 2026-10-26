import { prisma } from "@repo/db";
import { Response, Request } from "express"
import { errorResponse } from "../utils/error";
import { v4 as uuidv4 } from "uuid";
import { sendInviteEmail } from "../utils/email";
import { parseInviteEmail, sameEmail } from "../utils/inviteEmail";

// Prisma's unique constraint error, e.g. two requests racing past the checks below
const isUniqueViolation = (error: unknown) => (error as { code?: string })?.code === 'P2002';

export const inviteCoOrganizerController = async (req: Request, res: Response) => {
    try {

        console.log("API hit ho rhi hai bhai....")

        const quizId = req.params.quizId;
        const parsed = parseInviteEmail(req.body?.email);
        if ('error' in parsed) return errorResponse(res, 400, parsed.error);
        const { email } = parsed;

        const quiz = await prisma.quiz.findUnique({
            where: {
                id: quizId as string
            }
        });


        if (!quiz) return errorResponse(res, 404, 'Quiz not found');

        if (quiz.creatorId !== req.userId) return errorResponse(res, 403, 'Only Owner can invite...');

        // emails are matched case-insensitively, older rows may not be lower case
        const targetUser = await prisma.user.findFirst({
            where: {
                email: { equals: email, mode: 'insensitive' }
            }
        });

        if (targetUser && targetUser.id === quiz.creatorId) return errorResponse(res, 409, 'You cannot invite yourself');

        const existing = await prisma.quizOrganizer.findFirst({
            where: {
                quizId: quizId as string,
                OR: [
                    ...(targetUser ? [{ userId: targetUser.id }] : []),
                    { inviteEmail: { equals: email, mode: 'insensitive' as const } }
                ]
            }
        });

        if (existing) {
            return errorResponse(res, 409, existing.inviteStatus === 'ACCEPTED' ? 'Already an organizer' : 'Already invited');
        }

        const inviteToken = uuidv4();

        // if the user exists already then simply it added to that user as co-organizer otherwise create a new user...
        await prisma.quizOrganizer.create({
            data: {
                quizId: quizId as string,
                userId: targetUser ? targetUser.id : null,
                inviteEmail: email,
                inviteToken: inviteToken,
                role: 'CO_ORGANIZER',
                inviteStatus: 'PENDING'
            }
        });


        const inviteUrl = `${process.env.FRONTEND_URL}/invite/accept/${inviteToken}`;

        console.log("Invite accept url: ", inviteUrl);
        console.log("Invite email is: ", email);

        // now define a function to send the mail to the co-organizer
        await sendInviteEmail(email, quiz.title, inviteUrl);



        return res.status(200).json({
            message: 'Invitation Sent Sucessfully...'
        })

    } catch (error) {
        if (isUniqueViolation(error)) return errorResponse(res, 409, 'Already invited');
        console.log('Error while sending mail...', error);
        return errorResponse(res, 500, 'Internal Server Error');
    }
}


// logic for accepting invitation
export const acceptInvitationController = async (req: Request, res: Response) => {
    try {

        const token = req.params.token;

        const invite = await prisma.quizOrganizer.findUnique({
            where: { inviteToken: token as string }
        });

        if (!invite || invite.inviteStatus === 'ACCEPTED') return errorResponse(res, 400, 'Invalid or expired invitation');

        // verify logged-in user matches invited email if applicable
        const user = await prisma.user.findUnique({
            where: {
                id: req.userId
            },
        });

        if (invite.inviteEmail && !sameEmail(invite.inviteEmail, user?.email)) return errorResponse(res, 400, 'Email is not matching. Try again later');

        // already an organizer of this quiz through another row (e.g. an older duplicate invite),
        // so linking this one would break the unique (userId, quizId) constraint
        const alreadyOrganizer = await prisma.quizOrganizer.findFirst({
            where: {
                quizId: invite.quizId,
                userId: req.userId,
                id: { not: invite.id }
            }
        });

        if (alreadyOrganizer) {
            await prisma.quizOrganizer.delete({ where: { id: invite.id } });
            return errorResponse(res, 409, 'You are already an organizer of this quiz');
        }

        await prisma.quizOrganizer.update({
            where: { id: invite.id },
            data: {
                inviteStatus: 'ACCEPTED',
                userId: req.userId,
                inviteToken: null
            }
        });

        res.status(200).json({
            message: 'Invitation accepted...'
        })

    } catch (error) {
        if (isUniqueViolation(error)) return errorResponse(res, 409, 'You are already an organizer of this quiz');
        console.log("eror while accepting the invitation", error);
        return errorResponse(res, 500, 'Internal Server Error...')
    }
}