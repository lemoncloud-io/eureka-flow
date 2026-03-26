import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@flows/ui-kit';

import { useAuthStore } from '../stores/useAuthStore';

export const LoginPage = () => {
    const navigate = useNavigate();
    const login = useAuthStore(s => s.login);
    const [email, setEmail] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) return;
        login(email.trim());
        navigate('/', { replace: true });
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">Admin Login</CardTitle>
                    <CardDescription>어떤 값이든 입력하면 로그인됩니다 (Mockup)</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="admin@example.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <Button type="submit" className="w-full">
                            로그인
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
};
