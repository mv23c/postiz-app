// auth.service.test.ts
import 'dotenv/config';
import { AuthService } from '../auth.service';
import { Provider } from '@prisma/client';
import { CreateOrgUserDto } from '@gitroom/nestjs-libraries/dtos/auth/create.org.user.dto';
import { LoginUserDto } from '@gitroom/nestjs-libraries/dtos/auth/login.user.dto';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { UsersRepository } from '@gitroom/nestjs-libraries/database/prisma/users/users.repository';
import { OrganizationRepository } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.repository';
import { NotificationsRepository } from '@gitroom/nestjs-libraries/database/prisma/notifications/notifications.repository';
import * as AuthChecker from '@gitroom/helpers/auth/auth.service';

jest.mock('@gitroom/nestjs-libraries/database/prisma/users/users.service');
jest.mock('@gitroom/nestjs-libraries/database/prisma/organizations/organization.service');
jest.mock('@gitroom/nestjs-libraries/database/prisma/notifications/notification.service');
jest.mock('@gitroom/nestjs-libraries/services/email.service');

const mockUsersRepository = {
  getUserById: jest.fn(),
  getUserByEmail: jest.fn(),
};

const mockOrganizationRepository = {};

const mockNotificationRepository = {};

const mockNotificationService = new NotificationService(
  mockNotificationRepository as unknown as NotificationsRepository,
  new EmailService() as unknown as EmailService,
  mockOrganizationRepository as unknown as OrganizationRepository
) as jest.Mocked<NotificationService>;

jest.mock('@gitroom/helpers/auth/auth.service', () => ({
  ...jest.requireActual('@gitroom/helpers/auth/auth.service'),
  comparePassword: jest.fn(),
}));

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let organizationService: jest.Mocked<OrganizationService>;
  let notificationService: jest.Mocked<NotificationService>;
  let emailService: jest.Mocked<EmailService>;

  beforeEach(() => {
    usersService = new UsersService(mockUsersRepository as unknown as UsersRepository, mockOrganizationRepository as unknown as OrganizationRepository) as jest.Mocked<UsersService>;
    organizationService = new OrganizationService(mockOrganizationRepository as unknown as OrganizationRepository, mockNotificationService) as jest.Mocked<OrganizationService>;
    notificationService = mockNotificationService;
    emailService = new EmailService() as jest.Mocked<EmailService>;

    authService = new AuthService(
      usersService,
      organizationService,
      notificationService,
      emailService
    );

    (AuthChecker as any).comparePassword.mockImplementation((password: string, hashedPassword: string) => password === hashedPassword);
  });

  it('should throw error if provider is LOCAL and user already exists', async () => {
    usersService.getUserByEmail.mockResolvedValue({} as any);
    const dto = new CreateOrgUserDto();
    dto.email = 'test@example.com';

    await expect(authService.routeAuth(Provider.LOCAL, dto)).rejects.toThrow('User already exists');
  });

  it('should create user and send activation email if provider is LOCAL and user does not exist', async () => {
    usersService.getUserByEmail.mockResolvedValue(null);
    organizationService.createOrgAndUser.mockResolvedValue({
      users: [{ user: { id: '123', email: 'test@example.com' } }]
    } as any);
    const dto = new CreateOrgUserDto();
    dto.email = 'test@example.com';

    const result = await authService.routeAuth(Provider.LOCAL, dto);
    expect(result).toHaveProperty('jwt');
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'test@example.com',
      'Activate your account',
      expect.stringContaining('Click <a href="')
    );
  });

  it('should throw error if provider is LOCAL and password is incorrect', async () => {
    const user = { password: 'hashedpassword' };
    usersService.getUserByEmail.mockResolvedValue(user as any);
    (AuthChecker as any).comparePassword.mockReturnValue(false);
    const dto = new LoginUserDto();
    dto.email = 'test@example.com';
    dto.password = 'wrongpassword';

    await expect(authService.routeAuth(Provider.LOCAL, dto)).rejects.toThrow('Invalid user name or password');
  });

//   it('should throw error if user is not activated', async () => {
//     const user = { activated: false, password: 'hashedpassword' };
//     usersService.getUserByEmail.mockResolvedValue(user as any);
//     (AuthChecker as any).comparePassword.mockReturnValue(true); // Retorna true para passar pela verificação de senha
//     const dto = new LoginUserDto();
//     dto.email = 'test@example.com';
//     dto.password = 'correctpassword';

//     await expect(authService.routeAuth(Provider.LOCAL, dto)).rejects.toThrow('User is not activated');
//   });

  it('should return jwt if provider is not LOCAL and user is authenticated', async () => {
    const user = { id: '123', email: 'test@example.com' };
    const loginOrRegisterProvider = jest.spyOn(authService as any, 'loginOrRegisterProvider').mockResolvedValue(user);
    const dto = new CreateOrgUserDto();
    dto.email = 'test@example.com';

    const result = await authService.routeAuth(Provider.GOOGLE, dto);
    expect(result).toHaveProperty('jwt');
  });
});
